import { mkdirSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import sharp, { type Metadata } from 'sharp'

import { config } from './config.ts'

export const imagesDir = path.join(config.dataDir, 'images')
mkdirSync(imagesDir, { recursive: true })

/** What Teams renders a background at. Larger images are only scaled down again. */
export const TEAMS_WIDTH = 1920
export const TEAMS_HEIGHT = 1080
/** New Teams expects a `<guid>_thumb` next to each image, at most 280px wide. */
export const THUMB_WIDTH = 280
export const THUMB_HEIGHT = 158

export const MIN_WIDTH = 1280
export const MIN_HEIGHT = 720
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/**
 * Animated GIFs are kept at 720p: a 1080p animated GIF easily runs to tens of
 * megabytes, and Teams scales the background to the window anyway. GIFs are
 * usually smaller than photos, so the minimum is lower too.
 */
export const ANIMATED_WIDTH = 1280
export const ANIMATED_HEIGHT = 720
export const ANIMATED_MIN_WIDTH = 640
export const ANIMATED_MIN_HEIGHT = 360
/** About 10 seconds of a 30 fps recording such as Photo Booth's. */
export const MAX_INPUT_FRAMES = 300
/** Frames are thinned to about 15 fps: smooth enough for a background, half the size. */
export const TARGET_FRAME_MS = 66
/**
 * Frames in the finished GIF, seamless loop included. Encoding costs about a
 * quarter of a second per 720p frame, and uploads must finish well within
 * Cloudflare's 100-second request limit.
 */
export const MAX_OUTPUT_FRAMES = 150
export const MAX_ANIMATED_BYTES = 15 * 1024 * 1024

export interface UploadOptions {
  /** Play an animation forward, then backward, so it loops with no jump. */
  boomerang?: boolean
}

export type ImageVariant = 'full' | 'thumb' | 'preview'

const FILE_NAME = /^([a-z0-9]{10})(\.jpg|\.gif|_thumb\.jpg|_thumb\.png|\.webp)$/

/**
 * Photos are stored as JPEG. Animated backgrounds keep their GIF, with a
 * still PNG thumbnail. The gallery preview is WebP either way (animated
 * for animated backgrounds).
 */
export function imageFileName(id: string, variant: ImageVariant, animated = false): string {
  if (variant === 'thumb') return animated ? `${id}_thumb.png` : `${id}_thumb.jpg`
  if (variant === 'preview') return `${id}.webp`
  return animated ? `${id}.gif` : `${id}.jpg`
}

/** Public URL path of an image variant. */
export function imageHref(id: string, variant: ImageVariant, animated = false): string {
  return `/images/${imageFileName(id, variant, animated)}`
}

/** Pixel size of the full image we serve. */
export function fullSize(animated: boolean) {
  return animated
    ? { width: ANIMATED_WIDTH, height: ANIMATED_HEIGHT }
    : { width: TEAMS_WIDTH, height: TEAMS_HEIGHT }
}

/** Maps a requested `/images/:file` name to a path on disk, or null if it isn't one of ours. */
export function resolveImagePath(fileName: string): string | null {
  return FILE_NAME.test(fileName) ? path.join(imagesDir, fileName) : null
}

export class ImageRejectedError extends Error {}

/**
 * Normalises an upload into the three variants we serve, and returns whether
 * it's animated. EXIF data (including GPS) is dropped because sharp doesn't
 * copy metadata by default.
 *
 * - Photos: a 1920×1080 JPEG for Teams, a 280px JPEG thumbnail, a WebP preview.
 * - Animated GIFs: a 1280×720 animated GIF, a still 280px PNG thumbnail (the
 *   first frame), and an animated WebP preview. Single-frame GIFs are
 *   treated as photos.
 */
export async function processUpload(
  id: string,
  file: File,
  options: UploadOptions = {},
): Promise<{ animated: boolean }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageRejectedError('That file is over 25 MB.')
  }

  let input = Buffer.from(await file.arrayBuffer())
  let metadata
  try {
    metadata = await sharp(input, { animated: true }).metadata()
  } catch {
    throw new ImageRejectedError('That doesn’t look like an image we can read.')
  }
  if (!['jpeg', 'png', 'webp', 'heif', 'avif', 'tiff', 'gif'].includes(metadata.format ?? '')) {
    throw new ImageRejectedError('Upload a JPEG, PNG, WebP, HEIC or GIF.')
  }

  let animated = metadata.format === 'gif' && (metadata.pages ?? 1) > 1
  let written: string[] = []
  try {
    if (animated) {
      await oneAtATime(() => processAnimated(id, input, metadata, written, options))
    } else {
      await processStill(id, input, metadata, written)
    }
  } catch (error) {
    await Promise.all(written.map((file) => rm(file, { force: true })))
    throw error
  }
  return { animated }
}

async function processStill(id: string, input: Buffer, metadata: Metadata, written: string[]) {
  // EXIF orientation swaps width and height for portrait-shot photos.
  let rotated = (metadata.orientation ?? 1) >= 5
  let width = rotated ? metadata.height : metadata.width
  let height = rotated ? metadata.width : metadata.height
  if (!width || !height || width < MIN_WIDTH || height < MIN_HEIGHT) {
    throw new ImageRejectedError(
      `The photo is ${width}×${height}. Backgrounds need at least ${MIN_WIDTH}×${MIN_HEIGHT} so they stay sharp on screen.`,
    )
  }

  let oriented = sharp(input, { failOn: 'error', limitInputPixels: 100_000_000 }).rotate()
  let cover = { fit: 'cover' as const, position: sharp.strategy.attention }

  let full = path.join(imagesDir, imageFileName(id, 'full'))
  written.push(full)
  await oriented
    .clone()
    .resize(TEAMS_WIDTH, TEAMS_HEIGHT, cover)
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(full)

  let thumb = path.join(imagesDir, imageFileName(id, 'thumb'))
  written.push(thumb)
  await oriented
    .clone()
    .resize(THUMB_WIDTH, THUMB_HEIGHT, cover)
    .jpeg({ quality: 80 })
    .toFile(thumb)

  let preview = path.join(imagesDir, imageFileName(id, 'preview'))
  written.push(preview)
  await oriented.clone().resize(960, 540, cover).webp({ quality: 78 }).toFile(preview)
}

// Decoding a clip holds every frame in memory (about 2.7 MB per 720p frame),
// so animated uploads are processed one at a time.
let animatedQueue: Promise<unknown> = Promise.resolve()
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  let run = animatedQueue.then(task, task)
  animatedQueue = run.catch(() => {})
  return run
}

/**
 * Turns a GIF (typically a converted camera clip) into a compact looping
 * background:
 *
 * 1. Decode every frame once, cropped to 16:9 at 1280×720 around the centre.
 * 2. Thin to about 15 fps, keeping the total length.
 * 3. Optionally append the frames in reverse for a seamless boomerang loop.
 * 4. Encode without dithering, and let pixels that barely changed since the
 *    previous frame show through (`interFrameMaxError`). In a mostly still
 *    office shot that removes the camera's sensor noise, which is what
 *    makes GIFs of real footage huge: a 95 MB test clip came out at 5.5 MB.
 */
async function processAnimated(
  id: string,
  input: Buffer,
  metadata: Metadata,
  written: string[],
  options: UploadOptions,
) {
  let frameCount = metadata.pages ?? 1
  let width = metadata.width
  let height = metadata.pageHeight ?? metadata.height
  if (frameCount > MAX_INPUT_FRAMES) {
    throw new ImageRejectedError(
      `That GIF has ${frameCount} frames. Keep clips to about 10 seconds (${MAX_INPUT_FRAMES} frames at most).`,
    )
  }
  if (!width || !height || width < ANIMATED_MIN_WIDTH || height < ANIMATED_MIN_HEIGHT) {
    throw new ImageRejectedError(
      `The GIF is ${width}×${height}. Animated backgrounds need at least ${ANIMATED_MIN_WIDTH}×${ANIMATED_MIN_HEIGHT}.`,
    )
  }
  if (width > 4096 || height > 4096) {
    throw new ImageRejectedError(`The GIF is ${width}×${height}. Keep it under 4096×4096.`)
  }

  // Browsers play delays of 10 ms or less at 100 ms; do the same. Some GIFs
  // store a single delay for every frame.
  let delayAt = (i: number) => {
    let delay = metadata.delay?.[i] ?? metadata.delay?.[0] ?? 100
    return delay <= 10 ? 100 : delay
  }

  // Work out which frames to keep from the metadata alone, so a clip that's
  // too long is rejected before anything is decoded.
  let totalMs = 0
  for (let i = 0; i < frameCount; i++) totalMs += delayAt(i)
  let step = Math.max(1, Math.round(TARGET_FRAME_MS / (totalMs / frameCount)))
  let keep: number[] = []
  for (let i = 0; i < frameCount; i += step) keep.push(i)
  let boomerang = Boolean(options.boomerang) && keep.length > 2
  let outputFrames = boomerang ? 2 * keep.length - 2 : keep.length
  if (outputFrames > MAX_OUTPUT_FRAMES) {
    let seconds = (totalMs / 1000).toFixed(0)
    throw new ImageRejectedError(
      boomerang
        ? `That clip is ${seconds} seconds long. With a seamless loop it plays twice, so keep it to about 5 seconds.`
        : `That clip is ${seconds} seconds long. Keep it to about 10 seconds.`,
    )
  }
  let delays = keep.map((frame, k) => {
    let end = keep[k + 1] ?? frameCount
    let ms = 0
    for (let j = frame; j < end; j++) ms += delayAt(j)
    return ms
  })

  let W = ANIMATED_WIDTH
  let H = ANIMATED_HEIGHT
  let frameBytes = W * H * 3
  let frames = await sharp(input, { animated: true, failOn: 'error', limitInputPixels: false })
    .resize(W, H, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer()
  if (frames.length !== frameCount * frameBytes) {
    throw new ImageRejectedError('That GIF’s frames couldn’t be read. Try exporting it again.')
  }

  // Move the kept frames to the front of the buffer instead of copying them.
  keep.forEach((frame, k) => {
    if (frame !== k)
      frames.copy(frames, k * frameBytes, frame * frameBytes, (frame + 1) * frameBytes)
  })
  let count = keep.length
  let forward = frames.subarray(0, count * frameBytes)

  let clip = forward
  let clipDelays = delays
  if (boomerang) {
    // Forward, then backward without repeating the first and last frames.
    let backward = count - 2
    clip = Buffer.alloc((count + backward) * frameBytes)
    forward.copy(clip, 0)
    for (let b = 0; b < backward; b++) {
      let source = count - 2 - b
      forward.copy(clip, (count + b) * frameBytes, source * frameBytes, (source + 1) * frameBytes)
    }
    clipDelays = [...delays, ...delays.slice(1, -1).reverse()]
  }
  let clipFrames = clipDelays.length
  let raw = (buffer: Buffer, pages: number) =>
    sharp(buffer, { raw: { width: W, height: H * pages, channels: 3, pageHeight: H } })

  let gif = await raw(clip, clipFrames)
    .gif({ effort: 1, dither: 0, interFrameMaxError: 16, delay: clipDelays, loop: 0 })
    .toBuffer()
  if (gif.length > MAX_ANIMATED_BYTES) {
    let mb = (gif.length / 1024 / 1024).toFixed(0)
    let tips = options.boomerang
      ? 'Try a shorter clip, or turn off the seamless loop.'
      : 'Try a shorter clip, and keep the camera still.'
    throw new ImageRejectedError(
      `That came out at ${mb} MB, over the ${MAX_ANIMATED_BYTES / 1024 / 1024} MB limit. ${tips}`,
    )
  }
  let full = path.join(imagesDir, imageFileName(id, 'full', true))
  written.push(full)
  await writeFile(full, gif)

  // A still thumbnail from the first frame: Teams only shows it in the picker.
  let thumb = path.join(imagesDir, imageFileName(id, 'thumb', true))
  written.push(thumb)
  await sharp(forward.subarray(0, frameBytes), { raw: { width: W, height: H, channels: 3 } })
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover' })
    .png()
    .toFile(thumb)

  let preview = path.join(imagesDir, imageFileName(id, 'preview', true))
  written.push(preview)
  // From the finished GIF: sharp only resizes frame by frame when it loaded
  // an animation itself. Resizing the raw frames would squash them into one.
  // 640×360 is plenty for gallery cards, and much quicker than 960×540.
  await sharp(gif, { animated: true })
    .resize(640, 360)
    .webp({ quality: 60, effort: 2, loop: 0 })
    .toFile(preview)
}

/** Removes every variant we might have written for this id, still or animated. */
export async function deleteImages(id: string) {
  let names = new Set(
    (['full', 'thumb', 'preview'] as const).flatMap((variant) => [
      imageFileName(id, variant, false),
      imageFileName(id, variant, true),
    ]),
  )
  await Promise.all([...names].map((name) => rm(path.join(imagesDir, name), { force: true })))
}
