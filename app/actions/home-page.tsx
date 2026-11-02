import type { Handle } from 'remix/component'

import type { BackgroundSummary, LocationSummary, Sort } from '../data/catalog.ts'
import type { Identity } from '../data/users.ts'
import { routes } from '../routes.ts'
import { BackgroundGrid } from '../ui/background-card.tsx'
import { Document } from './document.tsx'

const SORT_LABELS: Record<Sort, string> = {
  top: 'Top rated',
  new: 'Newest',
  popular: 'Most added',
}

export function HomePage(
  handle: Handle<{
    user: Identity | null
    items: BackgroundSummary[]
    locations: LocationSummary[]
    sort: Sort
  }>,
) {
  return () => {
    let { user, items, locations, sort } = handle.props
    return (
      <Document user={user} section="browse" share={{ path: routes.home.href() }}>
        <div class="hero">
          <h1>Teams backgrounds from our offices</h1>
          <p>
            Real photos from the places we work, shared by colleagues. Pick one, add it to Teams
            with one command, and rate the ones you like.
          </p>
        </div>
        <div class="toolbar">
          <nav class="tabs" aria-label="Sort">
            {(Object.keys(SORT_LABELS) as Sort[]).map((key) => (
              <a
                key={key}
                href={routes.home.href(null, { searchParams: key === 'top' ? {} : { sort: key } })}
                aria-current={sort === key ? 'page' : undefined}
              >
                {SORT_LABELS[key]}
              </a>
            ))}
          </nav>
          {locations.length > 0 ? (
            <div class="chips" aria-label="Offices">
              {locations.slice(0, 12).map((location) => (
                <a
                  key={location.slug}
                  class="chip"
                  href={routes.locations.show.href({ slug: location.slug })}
                >
                  {location.name} · {location.count}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <BackgroundGrid
          items={items}
          empty="Nothing here yet. Be the first to share a photo of your office."
        />
      </Document>
    )
  }
}
