import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/**
 * The stylesheet's URL, with a hash of its contents. Cloudflare tells
 * browsers to keep static files for hours, so a fixed /styles.css kept
 * showing the old styles after a deploy; a new hash is a new URL.
 */
const css = readFileSync(new URL('../../public/styles.css', import.meta.url))
export const stylesheetHref = `/styles.css?v=${createHash('sha256').update(css).digest('hex').slice(0, 12)}`
