import type { Handle, RemixNode } from 'remix/component'
import { ImportMap } from 'remix/component/server'

import { scriptEntry } from '../assets.ts'
import type { Identity } from '../data/users.ts'
import { routes } from '../routes.ts'

export const APP_NAME = 'Behind Me'

export interface DocumentProps {
  children?: RemixNode
  title?: string
  user?: Identity | null
  /** Highlights the matching nav item. */
  section?: 'browse' | 'locations' | 'teams' | 'upload' | 'mine'
  head?: RemixNode
}

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { children, head, title, user, section } = handle.props
    let { href, importMap, preloads } = scriptEntry
    let current = (name: DocumentProps['section']) => (section === name ? 'page' : undefined)

    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light dark" />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="stylesheet" href="/styles.css" />
          <title>{title ? `${title} · ${APP_NAME}` : APP_NAME}</title>
          {head}
          <ImportMap value={importMap} />
          {preloads.map((preloadHref) => (
            <link key={preloadHref} rel="modulepreload" href={preloadHref} />
          ))}
          <script type="module" src={href}></script>
        </head>
        <body>
          <header class="site-header">
            <div class="wrap">
              <a class="brand" href={routes.home.href()}>
                <span class="brand-mark" aria-hidden="true"></span>
                {APP_NAME}
              </a>
              <nav class="nav" aria-label="Main">
                <a href={routes.home.href()} aria-current={current('browse')}>
                  Browse
                </a>
                <a href={routes.locations.index.href()} aria-current={current('locations')}>
                  Offices
                </a>
                <a href={routes.teamsHelp.href()} aria-current={current('teams')}>
                  Adding to Teams
                </a>
                {user ? (
                  <a href={routes.backgrounds.mine.href()} aria-current={current('mine')}>
                    My uploads
                  </a>
                ) : null}
              </nav>
              <div class="account">
                <a class="btn btn-primary" href={routes.backgrounds.uploadForm.href()}>
                  Share a background
                </a>
                {user ? (
                  <form method="post" action={routes.auth.logout.href()}>
                    <button
                      class="btn btn-ghost"
                      type="submit"
                      title={`Signed in as ${user.email}`}
                    >
                      Log out
                    </button>
                  </form>
                ) : (
                  <a class="btn btn-ghost" href={routes.auth.loginForm.href()}>
                    Log in
                  </a>
                )}
              </div>
            </div>
          </header>
          <main>
            <div class="wrap">{children}</div>
          </main>
          <footer class="site-footer">
            <div class="wrap">
              Photos are shared by colleagues. Images are resized to 1920×1080 and stripped of
              location data on upload. Built with{' '}
              <a href="https://remix.run" rel="noopener">
                Remix 3
              </a>{' '}
              ·{' '}
              <a href="https://github.com/poenneby/behindme.onneby.com" rel="noopener">
                Source
              </a>
            </div>
          </footer>
        </body>
      </html>
    )
  }
}
