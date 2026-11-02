import type { Middleware } from 'remix/router'

/**
 * Keeps the whole site out of search engines. It's an internal tool with
 * colleagues' photos and names, so every response (pages, images, scripts)
 * says noindex.
 *
 * robots.txt deliberately allows crawling. If it blocked crawlers, they could
 * never see this header, so a URL linked from elsewhere could still be
 * listed. Link-preview bots (Teams, Slack, LinkedIn) also need to fetch
 * pages to read the Open Graph tags.
 */
export const ROBOTS = 'noindex, nofollow, noimageindex, noarchive'

export function noIndex(): Middleware {
  return async (_context, next) => {
    let response = await next()
    try {
      response.headers.set('X-Robots-Tag', ROBOTS)
      return response
    } catch {
      // Some responses (e.g. Response.redirect) have immutable headers.
      let headers = new Headers(response.headers)
      headers.set('X-Robots-Tag', ROBOTS)
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
  }
}
