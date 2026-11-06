import type { Handle } from 'remix/component'

import type { BackgroundSummary } from '../data/catalog.ts'
import { imageHref } from '../images.ts'
import { routes } from '../routes.ts'
import { Stars } from './stars.tsx'

export function BackgroundGrid(handle: Handle<{ items: BackgroundSummary[]; empty?: string }>) {
  return () => {
    let { items, empty } = handle.props
    if (items.length === 0) {
      return <p class="empty">{empty ?? 'No backgrounds yet.'}</p>
    }
    return (
      <div class="grid">
        {items.map((item) => (
          <BackgroundCard key={item.id} item={item} />
        ))}
      </div>
    )
  }
}

export function BackgroundCard(handle: Handle<{ item: BackgroundSummary }>) {
  return () => {
    let { item } = handle.props
    return (
      <a class="card" href={routes.backgrounds.show.href({ id: item.id })}>
        <img src={imageHref(item.id, 'preview')} alt="" loading="lazy" width="960" height="540" />
        <div class="card-body">
          <span class="card-title">
            {item.status === 'pending' ? (
              <span class="badge badge-muted">Waiting for review</span>
            ) : null}
            {item.status === 'rejected' ? (
              <span class="badge badge-muted">Not approved</span>
            ) : null}
            {item.animated ? <span class="badge">Animated</span> : null}
            {item.title}
          </span>
          <span class="card-meta">
            <span>{item.categoryName}</span>
            <Stars rating={item.rating} count={item.ratingCount} />
          </span>
        </div>
      </a>
    )
  }
}
