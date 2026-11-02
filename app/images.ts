import { mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import * as path from 'node:path'
import sharp from 'sharp'

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

export type ImageVariant = 'full' | 'thumb' | 'preview'

const FILE_NAME = /^([a-z0-9]{10})(\.jpg|_thumb\.jpg|\.webp)$/

export function imageFileName(id: string, variant: ImageVariant): string {
  if (variant === 'thumb') return `${id}_thumb.jpg`
  if (variant === 'preview') return `${id}.webp`
  return `${id}.jpg`
}

/** Public URL path of an image variant. */
export function imageHref(id: string, variant: ImageVariant): string {
  return `/images/${imageFileName(id, variant)}`
}

/** Maps a requested `/images/:file` name to a path on disk, or null if it isn't one of ours. */
export function resolveImagePath(fileName: string): string | null {
  return FILE_NAME.test(fileName) ? path.join(imagesDir, fileName) : null
}

export class ImageRejectedError extends Error {}

/**
 * Normalises an upload into the three variants we serve: a 1920×1080 JPEG for
 * Teams, its 280px thumbnail, and a WebP preview for the gallery. EXIF data
 * (including GPS) is dropped because sharp doesn't copy metadata by default.
 */
export async function processUpload(id: string, file: File) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageRejectedError('That file is over 25 MB.')
  }

  let input = Buffer.from(await file.arrayBuffer())
  let image = sharp(input, { failOn: 'error', limitInputPixels: 100_000_000 })
  let metadata
  try {
    metadata = await image.metadata()
  } catch {
    throw new ImageRejectedError('That doesn’t look like an image we can read.')
  }
  if (!['jpeg', 'png', 'webp', 'heif', 'avif', 'tiff'].includes(metadata.format ?? '')) {
    throw new ImageRejectedError('Upload a JPEG, PNG, WebP or HEIC photo.')
  }

  // EXIF orientation swaps width and height for portrait-shot photos.
  let rotated = (metadata.orientation ?? 1) >= 5
  let width = rotated ? metadata.height : metadata.width
  let height = rotated ? metadata.width : metadata.height
  if (!width || !height || width < MIN_WIDTH || height < MIN_HEIGHT) {
    throw new ImageRejectedError(
      `The photo is ${width}×${height}. Backgrounds need at least ${MIN_WIDTH}×${MIN_HEIGHT} so they stay sharp on screen.`,
    )
  }

  let oriented = image.rotate()
  let cover = { fit: 'cover' as const, position: sharp.strategy.attention }
  let written: string[] = []
  try {
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
  } catch (error) {
    await Promise.all(written.map((file) => rm(file, { force: true })))
    throw error
  }
}

export async function deleteImages(id: string) {
  await Promise.all(
    (['full', 'thumb', 'preview'] as const).map((variant) =>
      rm(path.join(imagesDir, imageFileName(id, variant)), { force: true }),
    ),
  )
}
