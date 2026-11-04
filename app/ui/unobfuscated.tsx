import { unsafeHTML, type Handle } from 'remix/component'
import { html } from 'remix/html-template'

/**
 * Text Cloudflare must leave alone. Its Email Address Obfuscation rewrites
 * anything that looks like an email address into "[email protected]" (and
 * relies on a script to restore it), which breaks pages whose point is to
 * show the address. `<!--email_off-->` markers tell it to skip the text.
 * The text itself is escaped by the html template.
 */
export function Unobfuscated(handle: Handle<{ text: string }>) {
  return () => (
    <span
      innerHTML={unsafeHTML(String(html`<!--email_off-->${handle.props.text}<!--email_on-->`))}
    />
  )
}
