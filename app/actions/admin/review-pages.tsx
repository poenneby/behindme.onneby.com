import type { Handle } from 'remix/component'

import type { BackgroundSummary, CategorySummary } from '../../data/catalog.ts'
import type { Identity } from '../../data/users.ts'
import { imageHref } from '../../images.ts'
import { routes } from '../../routes.ts'
import { Unobfuscated } from '../../ui/unobfuscated.tsx'
import { Document } from '../document.tsx'

function Notice(handle: Handle<{ text?: string }>) {
  return () =>
    handle.props.text ? (
      <p class="notice" role="status">
        <Unobfuscated text={handle.props.text} />
      </p>
    ) : null
}

function Thumb(handle: Handle<{ background: BackgroundSummary }>) {
  return () => {
    let { background } = handle.props
    return (
      <a href={routes.backgrounds.show.href({ id: background.id })}>
        <img
          class="review-thumb"
          src={imageHref(background.id, 'preview', background.animated)}
          alt={background.title}
          width="320"
          height="180"
        />
      </a>
    )
  }
}

export function ReviewPage(
  handle: Handle<{
    user: Identity
    pending: BackgroundSummary[]
    reported: { background: BackgroundSummary; reasons: { reporter: string; reason: string }[] }[]
    notice?: string
  }>,
) {
  return () => {
    let { user, pending, reported, notice } = handle.props
    return (
      <Document user={user} title="Review" section="review">
        <div class="hero">
          <h1>Review</h1>
          <p>
            New backgrounds stay hidden until an admin approves them. Reported ones stay visible
            until you remove them.
          </p>
        </div>
        <Notice text={notice} />

        <h2>Waiting for approval ({pending.length})</h2>
        {pending.length === 0 ? (
          <p class="empty">Nothing waiting. New uploads will show up here.</p>
        ) : (
          <div class="review-list">
            {pending.map((background) => (
              <div key={background.id} class="review-item">
                <Thumb background={background} />
                <div class="stack" style={{ gap: '8px' }}>
                  <div>
                    <strong>{background.title}</strong>
                    {background.animated ? <span class="badge">Animated</span> : null}
                    <div class="muted small">
                      {background.categoryName} · by {background.authorName}
                    </div>
                    {background.description ? (
                      <p class="small" style={{ margin: '6px 0 0' }}>
                        {background.description}
                      </p>
                    ) : null}
                  </div>
                  <div class="row">
                    <form method="post" action={routes.admin.approve.href({ id: background.id })}>
                      <button class="btn btn-primary btn-small" type="submit">
                        Approve
                      </button>
                    </form>
                    <form
                      class="row"
                      method="post"
                      action={routes.admin.reject.href({ id: background.id })}
                    >
                      <input
                        class="search"
                        name="reason"
                        maxLength={300}
                        placeholder="Reason (optional, sent to them)"
                        aria-label="Reason for not approving"
                      />
                      <button class="btn btn-small btn-danger" type="submit">
                        Don’t approve
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <h2 style={{ marginTop: '36px' }}>Reported ({reported.length})</h2>
        {reported.length === 0 ? (
          <p class="empty">No open reports.</p>
        ) : (
          <div class="review-list">
            {reported.map(({ background, reasons }) => (
              <div key={background.id} class="review-item">
                <Thumb background={background} />
                <div class="stack" style={{ gap: '8px' }}>
                  <div>
                    <strong>{background.title}</strong>
                    <div class="muted small">
                      {background.categoryName} · by {background.authorName}
                    </div>
                  </div>
                  <ul class="small" style={{ margin: 0, paddingLeft: '18px' }}>
                    {reasons.map((report, index) => (
                      <li key={String(index)}>
                        “{report.reason}” <span class="muted">({report.reporter})</span>
                      </li>
                    ))}
                  </ul>
                  <div class="row">
                    <form
                      method="post"
                      action={routes.admin.removeReported.href({ id: background.id })}
                    >
                      <button class="btn btn-small btn-danger" type="submit">
                        Remove background
                      </button>
                    </form>
                    <form
                      method="post"
                      action={routes.admin.dismissReports.href({ id: background.id })}
                    >
                      <button class="btn btn-small" type="submit">
                        Keep it, close reports
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Document>
    )
  }
}

export function AdminCategoriesPage(
  handle: Handle<{
    user: Identity
    categories: (CategorySummary & { id: string })[]
    notice?: string
  }>,
) {
  return () => {
    let { user, categories, notice } = handle.props
    return (
      <Document user={user} title="Categories" section="admin-categories">
        <div class="hero">
          <h1>Manage categories</h1>
          <p>
            Rename a category to fix a typo. Renaming it to another category’s name merges the two.
          </p>
        </div>
        <Notice text={notice} />
        {categories.length === 0 ? (
          <p class="empty">No categories yet.</p>
        ) : (
          <div class="table-wrap">
            <table class="users">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Backgrounds</th>
                  <th>Rename to</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td class="cell-name">
                      <a href={routes.categories.show.href({ slug: category.slug })}>
                        {category.name}
                      </a>
                    </td>
                    <td data-label="Backgrounds">{category.count}</td>
                    <td class="cell-actions">
                      <form
                        class="row"
                        method="post"
                        action={routes.admin.renameCategory.href({ slug: category.slug })}
                      >
                        <input
                          class="search"
                          name="name"
                          required
                          minLength={2}
                          maxLength={60}
                          defaultValue={category.name}
                          aria-label={`New name for ${category.name}`}
                        />
                        <button class="btn btn-small" type="submit">
                          Rename
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Document>
    )
  }
}
