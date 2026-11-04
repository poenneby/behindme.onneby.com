import type { Handle } from 'remix/component'

import type { BackgroundSummary, LocationSummary } from '../../data/catalog.ts'
import type { Identity } from '../../data/users.ts'
import {
  ANIMATED_MIN_HEIGHT,
  ANIMATED_MIN_WIDTH,
  imageHref,
  MIN_HEIGHT,
  MIN_WIDTH,
} from '../../images.ts'
import { routes } from '../../routes.ts'
import { BackgroundGrid } from '../../ui/background-card.tsx'
import { Field, type FieldErrors } from '../../ui/field.tsx'
import { AddToTeams } from '../../ui/public/add-to-teams.tsx'
import { Stars } from '../../ui/stars.tsx'
import { Document } from '../document.tsx'

export function ShowPage(
  handle: Handle<{
    user: Identity | null
    background: BackgroundSummary
    myRating: number | null
    windowsCommand: string
    macCommand: string
    windowsScriptHref: string
    macScriptHref: string
  }>,
) {
  return () => {
    let { user, background: bg, myRating } = handle.props
    let isOwner = user?.id === bg.userId
    let shared = new Date(bg.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    return (
      <Document
        user={user}
        title={bg.title}
        share={{
          path: routes.backgrounds.show.href({ id: bg.id }),
          description: `${bg.locationName}, shared by ${bg.authorName}. Add it to Microsoft Teams with one command.`,
          image: bg.animated
            ? { path: imageHref(bg.id, 'full', true), alt: bg.title }
            : { path: imageHref(bg.id, 'full'), width: 1920, height: 1080, alt: bg.title },
        }}
      >
        <div class="detail">
          <div class="stack">
            <div class="detail-image">
              <img
                src={imageHref(bg.id, 'full', bg.animated)}
                alt={bg.title}
                width={bg.animated ? undefined : '1920'}
                height={bg.animated ? undefined : '1080'}
              />
            </div>
            {bg.description ? <p style={{ margin: 0 }}>{bg.description}</p> : null}
          </div>

          <aside class="stack">
            <div class="panel">
              <div class="stack" style={{ gap: '4px' }}>
                <a class="small muted" href={routes.locations.show.href({ slug: bg.locationSlug })}>
                  {bg.locationName}
                </a>
                <h1>
                  {bg.animated ? <span class="badge">Animated</span> : null}
                  {bg.title}
                </h1>
                <span class="small muted">
                  Shared by {bg.authorName} on {shared} · added {bg.downloads}{' '}
                  {bg.downloads === 1 ? 'time' : 'times'}
                </span>
              </div>
              <Stars rating={bg.rating} count={bg.ratingCount} />
              <div class="row">
                {/* `download` makes the browser save the file. Without it, Remix's
                    client-side navigation fetches the image and renders it as a page. */}
                <a
                  class="btn btn-primary"
                  href={routes.backgrounds.download.href({ id: bg.id })}
                  download
                >
                  {bg.animated ? 'Download GIF' : 'Download 1920×1080'}
                </a>
              </div>
            </div>

            <div class="panel">
              <AddToTeams
                windowsCommand={handle.props.windowsCommand}
                macCommand={handle.props.macCommand}
                windowsScriptHref={handle.props.windowsScriptHref}
                macScriptHref={handle.props.macScriptHref}
              />
            </div>

            <div class="panel">
              <h2>{isOwner ? 'Your background' : 'Rate it'}</h2>
              {isOwner ? (
                <form method="post" action={routes.backgrounds.destroy.href({ id: bg.id })}>
                  <button class="btn btn-danger" type="submit">
                    Delete this background
                  </button>
                </form>
              ) : user ? (
                <form method="post" action={routes.backgrounds.rate.href({ id: bg.id })}>
                  <div class="rate" role="group" aria-label="Your rating">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <button
                        key={n}
                        type="submit"
                        name="stars"
                        value={String(n)}
                        class={myRating !== null && n <= myRating ? 'on' : undefined}
                        aria-label={`${n} star${n === 1 ? '' : 's'}`}
                        aria-pressed={myRating === n ? 'true' : 'false'}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <p class="small muted" style={{ margin: '6px 0 0' }}>
                    {myRating ? `You gave it ${myRating}. Click to change.` : 'Click a star.'}
                  </p>
                </form>
              ) : (
                <p class="small muted" style={{ margin: 0 }}>
                  <a
                    href={routes.auth.loginForm.href(null, {
                      searchParams: { returnTo: routes.backgrounds.show.href({ id: bg.id }) },
                    })}
                  >
                    Log in
                  </a>{' '}
                  to rate it.
                </p>
              )}
            </div>

            {user?.role === 'admin' && !isOwner ? (
              <div class="panel">
                <h2>Admin</h2>
                <p class="small muted" style={{ margin: 0 }}>
                  Shared by {bg.authorName}. Deleting it removes it for everyone.
                </p>
                <form method="post" action={routes.backgrounds.destroy.href({ id: bg.id })}>
                  <button class="btn btn-danger" type="submit">
                    Delete this background
                  </button>
                </form>
              </div>
            ) : null}
          </aside>
        </div>
      </Document>
    )
  }
}

export function UploadPage(
  handle: Handle<{
    user: Identity
    locations: LocationSummary[]
    values?: { title?: string; location?: string; description?: string }
    errors?: FieldErrors
  }>,
) {
  return () => {
    let { user, locations, values = {}, errors = {} } = handle.props
    return (
      <Document user={user} title="Share a background" section="upload">
        <form
          class="form"
          method="post"
          action={routes.backgrounds.upload.href()}
          enctype="multipart/form-data"
        >
          <div class="hero">
            <h1>Share a background</h1>
            <p>
              Landscape photos work best: a meeting room, the view, the coffee corner. Avoid faces,
              whiteboards and screens with anything confidential on them.
            </p>
          </div>
          <details class="tips">
            <summary>Tip: photograph the view behind you, from your own camera</summary>
            <p>
              Taken from where you sit, with your own camera, the background lines up with the room
              around you and looks real. Sit where you normally do, then take the photo with
              yourself out of view:
            </p>
            <ul>
              <li>
                <strong>Mac, with Photo Booth.</strong> Make the window large first, because a small
                window saves a smaller photo. Tick <em>Edit → Auto Flip New Items</em> so the photo
                isn’t mirrored. Click the red camera button and duck out of view during the 3-second
                countdown. Drag the photo out of Photo Booth onto your desktop, or use{' '}
                <em>File → Export</em>.
              </li>
              <li>
                <strong>Windows, with the Camera app.</strong> Click the stopwatch to set a 5- or
                10-second timer, and pick the highest 16:9 photo resolution in its settings. Take
                the photo and step out of view. It’s saved in <em>Pictures → Camera Roll</em>.
              </li>
            </ul>
            <p>We crop it to 16:9 when you upload it.</p>
          </details>
          <Field
            label="Photo"
            name="photo"
            error={errors.photo}
            hint={
              <>
                A JPEG, PNG, WebP or HEIC photo at least {MIN_WIDTH}×{MIN_HEIGHT}, or an animated
                GIF at least {ANIMATED_MIN_WIDTH}×{ANIMATED_MIN_HEIGHT}, up to 25 MB. Photos are
                cropped to 16:9 at 1920×1080 and location data is removed. GIFs are used exactly as
                you upload them: <a href={routes.animatedHelp.href()}>how to make a good one</a>.
              </>
            }
          >
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif"
              required
            />
          </Field>
          <Field label="Title" name="title" error={errors.title}>
            <input
              id="title"
              name="title"
              required
              maxLength={80}
              placeholder="Open space, 5th floor"
              defaultValue={values.title}
            />
          </Field>
          <Field
            label="Office"
            name="location"
            error={errors.location}
            hint="Pick an existing office or type a new one, e.g. “Paris – Saint-Lazare”."
          >
            <input
              id="location"
              name="location"
              list="locations"
              required
              maxLength={60}
              defaultValue={values.location}
              autoComplete="off"
            />
            <datalist id="locations">
              {locations.map((location) => (
                <option key={location.slug} value={location.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Description (optional)" name="description" error={errors.description}>
            <textarea
              id="description"
              name="description"
              rows={3}
              maxLength={500}
              defaultValue={values.description ?? ''}
            />
          </Field>
          <div class="row">
            <button class="btn btn-primary" type="submit">
              Share it
            </button>
          </div>
        </form>
      </Document>
    )
  }
}

export function MinePage(handle: Handle<{ user: Identity; items: BackgroundSummary[] }>) {
  return () => {
    let { user, items } = handle.props
    return (
      <Document user={user} title="My uploads" section="mine">
        <div class="hero">
          <h1>My uploads</h1>
          <p>Backgrounds you’ve shared. Open one to delete it.</p>
        </div>
        <BackgroundGrid items={items} empty="You haven’t shared anything yet." />
      </Document>
    )
  }
}
