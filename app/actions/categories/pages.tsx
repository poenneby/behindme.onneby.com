import type { Handle } from 'remix/component'

import type { BackgroundSummary, CategorySummary } from '../../data/catalog.ts'
import type { Identity } from '../../data/users.ts'
import { imageHref } from '../../images.ts'
import { routes } from '../../routes.ts'
import { BackgroundGrid } from '../../ui/background-card.tsx'
import { AddToTeams } from '../../ui/public/add-to-teams.tsx'
import { Document } from '../document.tsx'

export function CategoriesPage(
  handle: Handle<{ user: Identity | null; categories: CategorySummary[] }>,
) {
  return () => {
    let { user, categories } = handle.props
    return (
      <Document
        user={user}
        title="Categories"
        section="categories"
        share={{
          path: routes.categories.index.href(),
          description: 'Teams backgrounds shared by colleagues, by category.',
        }}
      >
        <div class="hero">
          <h1>Categories</h1>
          <p>Every category someone has shared a background in.</p>
        </div>
        {categories.length === 0 ? (
          <p class="empty">No categories yet.</p>
        ) : (
          <div class="chips" style={{ gap: '10px' }}>
            {categories.map((category) => (
              <a
                key={category.slug}
                class="chip"
                style={{ fontSize: '16px', padding: '8px 14px' }}
                href={routes.categories.show.href({ slug: category.slug })}
              >
                {category.name} · {category.count}
              </a>
            ))}
          </div>
        )}
      </Document>
    )
  }
}

export function CategoryPage(
  handle: Handle<{
    user: Identity | null
    name: string
    slug: string
    items: BackgroundSummary[]
    windowsCommand: string
    macCommand: string
    windowsScriptHref: string
    macScriptHref: string
  }>,
) {
  return () => {
    let { user, name, slug, items } = handle.props
    let top = items[0]
    return (
      <Document
        user={user}
        title={name}
        section="categories"
        share={{
          path: routes.categories.show.href({ slug }),
          description: `${items.length} Teams ${items.length === 1 ? 'background' : 'backgrounds'} in ${name}. Add them all with one command.`,
          image: top
            ? top.animated
              ? { path: imageHref(top.id, 'full', true), alt: top.title }
              : { path: imageHref(top.id, 'full'), width: 1920, height: 1080, alt: top.title }
            : undefined,
        }}
      >
        <div class="detail" style={{ marginBottom: '28px', alignItems: 'end' }}>
          <div class="hero" style={{ margin: 0 }}>
            <a class="small muted" href={routes.categories.index.href()}>
              ← All categories
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
