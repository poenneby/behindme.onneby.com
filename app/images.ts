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
export const MAX_FRAMES = 300
export const MAX_ANIMATED_BYTES = 15 * 1024 * 1024

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
export async function processUpload(id: string, file: File): Promise<{ animated: boolean }> {
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
      await processAnimated(id, input, metadata, written)
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

async function processAnimated(id: string, input: Buffer, metadata: Metadata, written: string[]) {
  let frames = metadata.pages ?? 1
  let width = metadata.width
  let height = metadata.pageHeight ?? metadata.height
  if (frames > MAX_FRAMES) {
    throw new ImageRejectedError(
      `That GIF has ${frames} frames. Keep it to ${MAX_FRAMES} or fewer.`,
    )
  }
  if (!width || !height || width < ANIMATED_MIN_WIDTH || height < ANIMATED_MIN_HEIGHT) {
    throw new ImageRejectedError(
      `The GIF is ${width}×${height}. Animated backgrounds need at least ${ANIMATED_MIN_WIDTH}×${ANIMATED_MIN_HEIGHT}.`,
    )
  }

  // Every frame, cropped to 16:9 around the centre (smart cropping doesn't
  // apply to animations).
  let frames16x9 = () =>
    sharp(input, { animated: true, failOn: 'error', limitInputPixels: 500_000_000 })
  let cover = { fit: 'cover' as const }

  let gif = await frames16x9()
    .resize(ANIMATED_WIDTH, ANIMATED_HEIGHT, cover)
    .gif({ effort: 5 })
    .toBuffer()
  if (gif.length > MAX_ANIMATED_BYTES) {
    throw new ImageRejectedError(
      `That GIF is ${Math.round(gif.length / 1024 / 1024)} MB at ${ANIMATED_WIDTH}×${ANIMATED_HEIGHT}. Keep it under ${MAX_ANIMATED_BYTES / 1024 / 1024} MB by making it shorter or simpler.`,
    )
  }
  let full = path.join(imagesDir, imageFileName(id, 'full', true))
  written.push(full)
  await writeFile(full, gif)

  // A still thumbnail from the first frame: Teams only shows it in the picker.
  let thumb = path.join(imagesDir, imageFileName(id, 'thumb', true))
  written.push(thumb)
  await sharp(input, { failOn: 'error' })
    .resize(THUMB_WIDTH, THUMB_HEIGHT, cover)
    .png()
    .toFile(thumb)

  let preview = path.join(imagesDir, imageFileName(id, 'preview', true))
  written.push(preview)
  await frames16x9().resize(960, 540, cover).webp({ quality: 70 }).toFile(preview)
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
