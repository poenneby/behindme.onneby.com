import type { Handle } from 'remix/component'

import type { BackgroundSummary, LocationSummary } from '../../data/catalog.ts'
import type { Identity } from '../../data/users.ts'
import { routes } from '../../routes.ts'
import { BackgroundGrid } from '../../ui/background-card.tsx'
import { AddToTeams } from '../../ui/public/add-to-teams.tsx'
import { Document } from '../document.tsx'

export function LocationsPage(
  handle: Handle<{ user: Identity | null; locations: LocationSummary[] }>,
) {
  return () => {
    let { user, locations } = handle.props
    return (
      <Document user={user} title="Offices" section="locations">
        <div class="hero">
          <h1>Offices</h1>
          <p>Every office someone has shared a photo from.</p>
        </div>
        {locations.length === 0 ? (
          <p class="empty">No offices yet.</p>
        ) : (
          <div class="chips" style={{ gap: '10px' }}>
            {locations.map((location) => (
              <a
                key={location.slug}
                class="chip"
                style={{ fontSize: '16px', padding: '8px 14px' }}
                href={routes.locations.show.href({ slug: location.slug })}
              >
                {location.name} · {location.count}
              </a>
            ))}
          </div>
        )}
      </Document>
    )
  }
}

export function LocationPage(
  handle: Handle<{
    user: Identity | null
    name: string
    items: BackgroundSummary[]
    windowsCommand: string
    macCommand: string
    windowsScriptHref: string
    macScriptHref: string
  }>,
) {
  return () => {
    let { user, name, items } = handle.props
    return (
      <Document user={user} title={name} section="locations">
        <div class="detail" style={{ marginBottom: '28px', alignItems: 'end' }}>
          <div class="hero" style={{ margin: 0 }}>
            <a class="small muted" href={routes.locations.index.href()}>
              ← All offices
            </a>
            <h1>{name}</h1>
            <p>
              {items.length} {items.length === 1 ? 'background' : 'backgrounds'}, best rated first.
            </p>
          </div>
          {items.length > 0 ? (
            <div class="panel">
              <AddToTeams
                count={items.length}
                windowsCommand={handle.props.windowsCommand}
                macCommand={handle.props.macCommand}
                windowsScriptHref={handle.props.windowsScriptHref}
                macScriptHref={handle.props.macScriptHref}
              />
            </div>
          ) : null}
        </div>
        <BackgroundGrid items={items} />
      </Document>
    )
  }
}
