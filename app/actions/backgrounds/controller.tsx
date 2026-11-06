import { randomUUID } from 'node:crypto'
import type { Database } from 'remix/data-table'
import * as s from 'remix/data-schema'
import * as checks from 'remix/data-schema/checks'
import * as f from 'remix/data-schema/form-data'
import { openLazyFile } from 'remix/fs'
import { createFileResponse } from 'remix/response/file'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { notifyReported, notifyReviewNeeded } from '../../account-mail.ts'
import {
  canSee,
  countDownload,
  createBackground,
  deleteBackground,
  editBackground,
  findOrCreateCategory,
  getBackground,
  getUserRating,
  listBackgrounds,
  listCategories,
  rateBackground,
  type BackgroundSummary,
  type Status,
} from '../../data/catalog.ts'
import { newId, slugify } from '../../data/ids.ts'
import { reportBackground } from '../../data/reports.ts'
import type { Identity } from '../../data/users.ts'
import {
  deleteImages,
  ImageRejectedError,
  processUpload,
  resolveImagePath,
  imageFileName,
} from '../../images.ts'
import { requireUser } from '../../middleware/auth.ts'
import { routes } from '../../routes.ts'
import {
  macCommand,
  macScript,
  scriptResponse,
  windowsCommand,
  windowsScript,
} from '../../teams.ts'
import { config } from '../../config.ts'
import { currentUser, signedInUser } from '../../ui/current-user.ts'
import type { FieldErrors } from '../../ui/field.tsx'
import { EditPage, MinePage, ShowPage, UploadPage } from './pages.tsx'

const trimmed = s.string().transform((value) => value.trim().replace(/\s+/g, ' '))

const detailsForm = f.object({
  title: f.field(trimmed.pipe(checks.minLength(1), checks.maxLength(80))),
  category: f.field(trimmed.pipe(checks.minLength(2), checks.maxLength(60))),
  description: f.field(
    s
      .defaulted(s.string(), '')
      .transform((v) => v.trim())
      .pipe(checks.maxLength(500)),
  ),
})

const MESSAGES: Record<string, string> = {
  title: 'Give it a short title (up to 80 characters).',
  category: 'Give it a category (2–60 characters).',
  description: 'Keep the description under 500 characters.',
}

function issueField(issue: { path?: ReadonlyArray<unknown> }) {
  let first = issue.path?.[0]
  return typeof first === 'object' && first !== null && 'key' in first
    ? String((first as { key: unknown }).key)
    : String(first ?? 'form')
}

function fieldErrors(issues: ReadonlyArray<{ path?: ReadonlyArray<unknown>; message: string }>) {
  let errors: FieldErrors = {}
  for (let issue of issues) {
    let field = issueField(issue)
    errors[field] ??= MESSAGES[field] ?? issue.message
  }
  return errors
}

function absolute(href: string) {
  return new URL(href, config.publicOrigin).href
}

const notFound = () => new Response('Not Found', { status: 404 })

/** The background, if this viewer may see it (approved, or theirs, or they're an admin). */
async function visibleBackground(
  db: Database,
  id: string,
  viewer: Identity | null,
): Promise<BackgroundSummary | null> {
  let background = await getBackground(db, id)
  return background && canSee(background, viewer) ? background : null
}

/** Only the uploader or an admin may change a background. */
function mayChange(background: BackgroundSummary, user: Identity) {
  return background.userId === user.id || user.role === 'admin'
}

export default createController(routes.backgrounds, {
  actions: {
    uploadForm: {
      middleware: [requireUser()],
      async handler(context) {
        let categories = await listCategories(context.db)
        return context.render(<UploadPage user={signedInUser(context)} categories={categories} />)
      },
    },

    upload: {
      middleware: [requireUser()],
      async handler(context) {
        let user = signedInUser(context)
        let values = {
          title: String(context.formData.get('title') ?? ''),
          category: String(context.formData.get('category') ?? ''),
          description: String(context.formData.get('description') ?? ''),
          rules: context.formData.get('rules') === 'on',
        }
        let result = s.parseSafe(detailsForm, context.formData)
        let errors: FieldErrors = result.success ? {} : fieldErrors(result.issues)
        if (!values.rules) {
          errors.rules = 'Please confirm the photo follows these rules.'
        }
        let photo = context.formData.get('photo')
        if (!(photo instanceof File) || photo.size === 0) {
          errors.photo = 'Choose a photo to upload.'
        }

        let id = newId()
        let animated = false
        if (Object.keys(errors).length === 0 && photo instanceof File) {
          try {
            ;({ animated } = await processUpload(id, photo))
          } catch (error) {
            if (!(error instanceof ImageRejectedError)) throw error
            errors.photo = error.message
          }
        }

        if (!result.success || Object.keys(errors).length > 0) {
          await deleteImages(id)
          let categories = await listCategories(context.db)
          return context.render(
            <UploadPage user={user} categories={categories} values={values} errors={errors} />,
            { status: 400 },
          )
        }

        // Admins' own uploads don't need reviewing.
        let status: Status = user.role === 'admin' ? 'approved' : 'pending'
        try {
          let category = await findOrCreateCategory(context.db, result.value.category)
          await createBackground(context.db, {
            id,
            teamsGuid: randomUUID(),
            userId: user.id,
            categoryId: category.id,
            title: result.value.title,
            description: result.value.description,
            animated,
            status,
          })
        } catch (error) {
          await deleteImages(id)
          throw error
        }
        if (status === 'pending') {
          await notifyReviewNeeded(context.db, { title: result.value.title }, user)
        }
        return redirect(routes.backgrounds.show.href({ id }), 303)
      },
    },

    mine: {
      middleware: [requireUser()],
      async handler(context) {
        let user = signedInUser(context)
        let items = await listBackgrounds(context.db, {
          userId: user.id,
          sort: 'new',
          status: 'any',
        })
        return context.render(<MinePage user={user} items={items} />)
      },
    },

    async show(context) {
      let user = currentUser(context)
      let background = await visibleBackground(context.db, context.params.id, user)
      if (!background) return notFound()
      let myRating = user ? await getUserRating(context.db, background.id, user.id) : null
      let windowsHref = routes.backgrounds.windows.href({ id: background.id })
      let macHref = routes.backgrounds.mac.href({ id: background.id })
      let notice = context.session.get('notice')
      return context.render(
        <ShowPage
          user={user}
          background={background}
          myRating={myRating}
          notice={typeof notice === 'string' ? notice : undefined}
          windowsCommand={windowsCommand(absolute(windowsHref))}
          macCommand={macCommand(absolute(macHref))}
          windowsScriptHref={windowsHref}
          macScriptHref={macHref}
        />,
        // Pending pages are personal: keep them out of shared caches.
        background.status === 'approved'
          ? undefined
          : { headers: { 'Cache-Control': 'private, no-store' } },
      )
    },

    async download(context) {
      let background = await visibleBackground(context.db, context.params.id, currentUser(context))
      let filePath =
        background && resolveImagePath(imageFileName(background.id, 'full', background.animated))
      if (!background || !filePath) return notFound()
      if (background.status === 'approved') await countDownload(context.db, [background.id])
      let response = await createFileResponse(openLazyFile(filePath), context.request)
      let ext = background.animated ? 'gif' : 'jpg'
      let name = `${slugify(background.categoryName)}-${slugify(background.title)}.${ext}`
      response.headers.set('Content-Disposition', `attachment; filename="${name}"`)
      if (background.status !== 'approved')
        response.headers.set('Cache-Control', 'private, no-store')
      return response
    },

    rate: {
      middleware: [requireUser()],
      async handler(context) {
        let background = await getBackground(context.db, context.params.id)
        if (!background || background.status !== 'approved') return notFound()
        let stars = Number(context.formData.get('stars'))
        if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
          return new Response('Rating must be 1–5', { status: 400 })
        }
        if (background.userId === signedInUser(context).id) {
          return new Response('You can’t rate your own background', { status: 403 })
        }
        await rateBackground(context.db, {
          backgroundId: background.id,
          userId: signedInUser(context).id,
          stars,
        })
        return redirect(routes.backgrounds.show.href({ id: background.id }), 303)
      },
    },

    report: {
      middleware: [requireUser()],
      async handler(context) {
        let user = signedInUser(context)
        let background = await getBackground(context.db, context.params.id)
        if (!background || background.status !== 'approved') return notFound()
        if (background.userId === user.id) {
          return new Response('You can delete your own background instead', { status: 403 })
        }
        let reason = String(context.formData.get('reason') ?? '')
          .trim()
          .slice(0, 300)
        if (reason.length < 3) {
          context.session.flash('notice', 'Say briefly what’s wrong with it, so admins can check.')
          return redirect(routes.backgrounds.show.href({ id: background.id }), 303)
        }
        await reportBackground(context.db, { backgroundId: background.id, userId: user.id, reason })
        await notifyReported(context.db, background, reason, user.id)
        context.session.flash('notice', 'Thanks. An admin will take a look.')
        return redirect(routes.backgrounds.show.href({ id: background.id }), 303)
      },
    },

    editForm: {
      middleware: [requireUser()],
      async handler(context) {
        let user = signedInUser(context)
        let background = await visibleBackground(context.db, context.params.id, user)
        if (!background) return notFound()
        if (!mayChange(background, user)) return new Response('Not yours to edit', { status: 403 })
        return context.render(
          <EditPage
            user={user}
            background={background}
            categories={await listCategories(context.db)}
          />,
        )
      },
    },

    edit: {
      middleware: [requireUser()],
      async handler(context) {
        let user = signedInUser(context)
        let background = await visibleBackground(context.db, context.params.id, user)
        if (!background) return notFound()
        if (!mayChange(background, user)) return new Response('Not yours to edit', { status: 403 })
        let result = s.parseSafe(detailsForm, context.formData)
        if (!result.success) {
          return context.render(
            <EditPage
              user={user}
              background={background}
              categories={await listCategories(context.db)}
              values={{
                title: String(context.formData.get('title') ?? ''),
                category: String(context.formData.get('category') ?? ''),
                description: String(context.formData.get('description') ?? ''),
              }}
              errors={fieldErrors(result.issues)}
            />,
            { status: 400 },
          )
        }
        let category = await findOrCreateCategory(context.db, result.value.category)
        await editBackground(context.db, background.id, {
          title: result.value.title,
          description: result.value.description,
          categoryId: category.id,
        })
        context.session.flash('notice', 'Saved.')
        return redirect(routes.backgrounds.show.href({ id: background.id }), 303)
      },
    },

    destroy: {
      middleware: [requireUser()],
      async handler(context) {
        let user = signedInUser(context)
        let background = await visibleBackground(context.db, context.params.id, user)
        if (!background) return notFound()
        if (!mayChange(background, user)) {
          return new Response('Only the person who shared it, or an admin, can delete it', {
            status: 403,
          })
        }
        await deleteBackground(context.db, background.id)
        await deleteImages(background.id)
        let isOwner = background.userId === user.id
        return redirect(isOwner ? routes.backgrounds.mine.href() : routes.home.href(), 303)
      },
    },

    // Install scripts are fetched by PowerShell or curl without a session,
    // so only approved backgrounds have one.
    async windows(context) {
      let background = await getBackground(context.db, context.params.id)
      if (!background || background.status !== 'approved') return notFound()
      await countDownload(context.db, [background.id])
      return scriptResponse(windowsScript([background]), 'windows')
    },

    async mac(context) {
      let background = await getBackground(context.db, context.params.id)
      if (!background || background.status !== 'approved') return notFound()
      await countDownload(context.db, [background.id])
      return scriptResponse(macScript([background]), 'mac')
    },
  },
})
