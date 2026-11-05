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
 * Animated GIFs are stored exactly as uploaded: making a small, good-looking
 * GIF is up to the person sharing it (the /animated page explains how). We
 * only check it's big enough to look decent as a background.
 */
export const ANIMATED_MIN_WIDTH = 640
export const ANIMATED_MIN_HEIGHT = 360

export type ImageVariant = 'full' | 'thumb' | 'preview'

const FILE_NAME = /^([a-z0-9]{10})(\.jpg|\.gif|_thumb\.jpg|_thumb\.png|\.webp)$/

/**
 * Photos are stored as JPEG. Animated backgrounds keep their GIF, with a
 * still PNG thumbnail. The gallery preview is a WebP either way, a still of
 * the first frame for animated backgrounds.
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

/** The background id an image file name belongs to, or null. */
export function imageId(fileName: string): string | null {
  return FILE_NAME.exec(fileName)?.[1] ?? null
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
 * - Animated GIFs: the GIF itself, byte for byte, plus a still 280px PNG
 *   thumbnail and a still WebP preview, both from the first frame.
 *   Single-frame GIFs are treated as photos.
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

/**
 * Keeps an animated GIF exactly as uploaded. Only the first frame is decoded,
 * for the thumbnail Teams shows in its picker and the gallery preview.
 */
async function processAnimated(id: string, input: Buffer, metadata: Metadata, written: string[]) {
  let width = metadata.width
  let height = metadata.pageHeight ?? metadata.height
  if (!width || !height || width < ANIMATED_MIN_WIDTH || height < ANIMATED_MIN_HEIGHT) {
    throw new ImageRejectedError(
      `The GIF is ${width}×${height}. Animated backgrounds need at least ${ANIMATED_MIN_WIDTH}×${ANIMATED_MIN_HEIGHT}.`,
    )
  }

  let full = path.join(imagesDir, imageFileName(id, 'full', true))
  written.push(full)
  await writeFile(full, input)

  let firstFrame = sharp(input, { failOn: 'error' })
  let cover = { fit: 'cover' as const }

  let thumb = path.join(imagesDir, imageFileName(id, 'thumb', true))
  written.push(thumb)
  await firstFrame.clone().resize(THUMB_WIDTH, THUMB_HEIGHT, cover).png().toFile(thumb)

  let preview = path.join(imagesDir, imageFileName(id, 'preview', true))
  written.push(preview)
  await firstFrame.clone().resize(960, 540, cover).webp({ quality: 78 }).toFile(preview)
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
