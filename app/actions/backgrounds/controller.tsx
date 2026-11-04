import { randomUUID } from 'node:crypto'
import * as s from 'remix/data-schema'
import * as checks from 'remix/data-schema/checks'
import * as f from 'remix/data-schema/form-data'
import { openLazyFile } from 'remix/fs'
import { createFileResponse } from 'remix/response/file'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import {
  countDownload,
  createBackground,
  deleteBackground,
  findOrCreateLocation,
  getBackground,
  getUserRating,
  listBackgrounds,
  listLocations,
  rateBackground,
} from '../../data/catalog.ts'
import { newId, slugify } from '../../data/ids.ts'
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
import { MinePage, ShowPage, UploadPage } from './pages.tsx'

const trimmed = s.string().transform((value) => value.trim().replace(/\s+/g, ' '))

const uploadForm = f.object({
  title: f.field(trimmed.pipe(checks.minLength(1), checks.maxLength(80))),
  location: f.field(trimmed.pipe(checks.minLength(2), checks.maxLength(60))),
  description: f.field(
    s
      .defaulted(s.string(), '')
      .transform((v) => v.trim())
      .pipe(checks.maxLength(500)),
  ),
})

const MESSAGES: Record<string, string> = {
  title: 'Give it a short title (up to 80 characters).',
  location: 'Which office is this? (2–60 characters)',
  description: 'Keep the description under 500 characters.',
}

function issueField(issue: { path?: ReadonlyArray<unknown> }) {
  let first = issue.path?.[0]
  return typeof first === 'object' && first !== null && 'key' in first
    ? String((first as { key: unknown }).key)
    : String(first ?? 'form')
}

function absolute(href: string) {
  return new URL(href, config.publicOrigin).href
}

export default createController(routes.backgrounds, {
  actions: {
    uploadForm: {
      middleware: [requireUser()],
      async handler(context) {
        let locations = await listLocations(context.db)
        return context.render(<UploadPage user={signedInUser(context)} locations={locations} />)
      },
    },

    upload: {
      middleware: [requireUser()],
      async handler(context) {
        let user = signedInUser(context)
        let values = {
          title: String(context.formData.get('title') ?? ''),
          location: String(context.formData.get('location') ?? ''),
          description: String(context.formData.get('description') ?? ''),
        }
        let errors: FieldErrors = {}
        let result = s.parseSafe(uploadForm, context.formData)
        if (!result.success) {
          for (let issue of result.issues) {
            let field = issueField(issue)
            errors[field] ??= MESSAGES[field] ?? issue.message
          }
        }
        let photo = context.formData.get('photo')
        if (!(photo instanceof File) || photo.size === 0) {
          errors.photo = 'Choose a photo to upload.'
        }

        let id = newId()
        let animated = false
        if (result.success && photo instanceof File && photo.size > 0) {
          try {
            ;({ animated } = await processUpload(id, photo))
          } catch (error) {
            if (!(error instanceof ImageRejectedError)) throw error
            errors.photo = error.message
          }
        }

        if (!result.success || Object.keys(errors).length > 0) {
          await deleteImages(id)
          let locations = await listLocations(context.db)
          return context.render(
            <UploadPage user={user} locations={locations} values={values} errors={errors} />,
            { status: 400 },
          )
        }

        try {
          let location = await findOrCreateLocation(context.db, result.value.location)
          await createBackground(context.db, {
            id,
            teamsGuid: randomUUID(),
            userId: user.id,
            locationId: location.id,
            title: result.value.title,
            description: result.value.description,
            animated,
          })
        } catch (error) {
          await deleteImages(id)
          throw error
        }
        return redirect(routes.backgrounds.show.href({ id }), 303)
      },
    },

    mine: {
      middleware: [requireUser()],
      async handler(context) {
        let user = signedInUser(context)
        let items = await listBackgrounds(context.db, { userId: user.id, sort: 'new' })
        return context.render(<MinePage user={user} items={items} />)
      },
    },

    async show(context) {
      let background = await getBackground(context.db, context.params.id)
      if (!background) return new Response('Not Found', { status: 404 })
      let user = currentUser(context)
      let myRating = user ? await getUserRating(context.db, background.id, user.id) : null
      let windowsHref = routes.backgrounds.windows.href({ id: background.id })
      let macHref = routes.backgrounds.mac.href({ id: background.id })
      return context.render(
        <ShowPage
          user={user}
          background={background}
          myRating={myRating}
          windowsCommand={windowsCommand(absolute(windowsHref))}
          macCommand={macCommand(absolute(macHref))}
          windowsScriptHref={windowsHref}
          macScriptHref={macHref}
        />,
      )
    },

    async download(context) {
      let background = await getBackground(context.db, context.params.id)
      let filePath =
        background && resolveImagePath(imageFileName(background.id, 'full', background.animated))
      if (!background || !filePath) return new Response('Not Found', { status: 404 })
      await countDownload(context.db, [background.id])
      let response = await createFileResponse(openLazyFile(filePath), context.request)
      let ext = background.animated ? 'gif' : 'jpg'
      let name = `${slugify(background.locationName)}-${slugify(background.title)}.${ext}`
      response.headers.set('Content-Disposition', `attachment; filename="${name}"`)
      return response
    },

    rate: {
      middleware: [requireUser()],
      async handler(context) {
        let background = await getBackground(context.db, context.params.id)
        if (!background) return new Response('Not Found', { status: 404 })
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

    destroy: {
      middleware: [requireUser()],
      async handler(context) {
        let background = await getBackground(context.db, context.params.id)
        if (!background) return new Response('Not Found', { status: 404 })
        let user = signedInUser(context)
        let isOwner = background.userId === user.id
        if (!isOwner && user.role !== 'admin') {
          return new Response('Only the person who shared it, or an admin, can delete it', {
            status: 403,
          })
        }
        await deleteBackground(context.db, background.id)
        await deleteImages(background.id)
        return redirect(isOwner ? routes.backgrounds.mine.href() : routes.home.href(), 303)
      },
    },

    async windows(context) {
      let background = await getBackground(context.db, context.params.id)
      if (!background) return new Response('Not Found', { status: 404 })
      await countDownload(context.db, [background.id])
      return scriptResponse(windowsScript([background]), 'windows')
    },

    async mac(context) {
      let background = await getBackground(context.db, context.params.id)
      if (!background) return new Response('Not Found', { status: 404 })
      await countDownload(context.db, [background.id])
      return scriptResponse(macScript([background]), 'mac')
    },
  },
})
