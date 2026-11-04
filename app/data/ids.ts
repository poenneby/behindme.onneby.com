import { randomBytes } from 'node:crypto'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Short, URL-safe, lowercase id (36^10 ≈ 3.6e15 values). */
export function newId(length = 10): string {
  let bytes = randomBytes(length)
  let id = ''
  for (let byte of bytes) id += ALPHABET[byte % ALPHABET.length]
  return id
}

export function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'category'
  )
}
