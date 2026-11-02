import type { Handle } from 'remix/component'

export function Stars(handle: Handle<{ rating: number; count: number }>) {
  return () => {
    let { rating, count } = handle.props
    if (count === 0) {
      return <span class="stars muted small">Not rated</span>
    }
    let filled = Math.round(rating)
    return (
      <span class="stars" aria-label={`Rated ${rating.toFixed(1)} out of 5 by ${count}`}>
        {'★'.repeat(filled)}
        {'☆'.repeat(5 - filled)}
        <span class="count">
          {rating.toFixed(1)} ({count})
        </span>
      </span>
    )
  }
}
