import type { Handle, RemixNode } from 'remix/component'
import { ImportMap } from 'remix/component/server'

import { scriptEntry } from '../assets.ts'
import { config } from '../config.ts'
import type { Identity } from '../data/users.ts'
import { ROBOTS } from '../middleware/no-index.ts'
import { routes } from '../routes.ts'

export const APP_NAME = 'Behind Me'
const DEFAULT_DESCRIPTION =
  'Microsoft Teams backgrounds photographed in our offices. Pick one and add it to Teams with one command.'

/** What a shared link unfurls to in Teams, Slack, LinkedIn and friends. */
export interface ShareInfo {
  /** Path of the page, made absolute with PUBLIC_ORIGIN. */
  path: string
  description?: string
  /** Width and height are optional: uploaded GIFs can be any size. */
  image?: { path: string; width?: number; height?: number; alt: string }
}

const DEFAULT_IMAGE = {
  path: '/og-default.jpg',
  width: 1200,
  height: 630,
  alt: 'Behind Me: Teams backgrounds from our offices',
}

export interface DocumentProps {
  children?: RemixNode
  title?: string
  user?: Identity | null
  /** Highlights the matching nav item. */
  section?: 'browse' | 'locations' | 'teams' | 'upload' | 'mine'
  share?: ShareInfo
  head?: RemixNode
}

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { children, head, title, user, section, share } = handle.props
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
          <meta name="robots" content={ROBOTS} />
          <ShareMeta title={title} share={share} />
          <meta name="theme-color" content="#c8102e" />
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
              Shared by colleagues. Photos are resized to 1920×1080 and stripped of location data;
              GIFs are kept as uploaded. Built with{' '}
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

function ShareMeta(handle: Handle<{ title?: string; share?: ShareInfo }>) {
  return () => {
    let { title, share } = handle.props
    let absolute = (path: string) => new URL(path, config.publicOrigin).href
    let description = share?.description ?? DEFAULT_DESCRIPTION
    let image = share?.image ?? DEFAULT_IMAGE
    return (
      <>
        <meta name="description" content={description} />
        <meta property="og:site_name" content={APP_NAME} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title ?? APP_NAME} />
        <meta property="og:description" content={description} />
        {share ? <meta property="og:url" content={absolute(share.path)} /> : null}
        <meta property="og:image" content={absolute(image.path)} />
        {image.width && image.height ? (
          <>
            <meta property="og:image:width" content={String(image.width)} />
            <meta property="og:image:height" content={String(image.height)} />
          </>
        ) : null}
        <meta property="og:image:alt" content={image.alt} />
        <meta name="twitter:card" content="summary_large_image" />
      </>
    )
  }
}
