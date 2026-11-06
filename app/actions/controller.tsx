import { openLazyFile } from 'remix/fs'
import { createFileResponse } from 'remix/response/file'
import { createController } from 'remix/router'

import { assets } from '../assets.ts'
import {
  canSee,
  getBackground,
  listBackgrounds,
  listCategories,
  type Sort,
} from '../data/catalog.ts'
import { imageId, resolveImagePath } from '../images.ts'
import { routes } from '../routes.ts'
import { currentUser } from '../ui/current-user.ts'
import { HomePage } from './home-page.tsx'
import { AnimatedHelpPage } from './animated-help-page.tsx'
import { TeamsHelpPage } from './teams-help-page.tsx'

const SORTS: Sort[] = ['top', 'new', 'popular']

export default createController(routes, {
  actions: {
    async assets(context) {
      return (await assets.fetch(context.request)) ?? new Response('Not Found', { status: 404 })
    },

    health() {
      return new Response('ok')
    },

    async home(context) {
      let requested = context.url.searchParams.get('sort') as Sort | null
      let sort: Sort = requested && SORTS.includes(requested) ? requested : 'top'
      let [items, categories] = await Promise.all([
        listBackgrounds(context.db, { sort }),
        listCategories(context.db),
      ])
      return context.render(
        <HomePage user={currentUser(context)} items={items} categories={categories} sort={sort} />,
      )
    },

    animatedHelp(context) {
      return context.render(<AnimatedHelpPage user={currentUser(context)} />)
    },

    teamsHelp(context) {
      return context.render(<TeamsHelpPage user={currentUser(context)} />)
    },

    async image(context) {
      // Never cache a 404: an image hidden while pending must appear as soon
      // as it's approved, not hours later when Cloudflare's copy expires.
      let notFound = () =>
        new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
      let filePath = resolveImagePath(context.params.file)
      let id = imageId(context.params.file)
      if (!filePath || !id) return notFound()
      let background = await getBackground(context.db, id)
      if (!background || !canSee(background, currentUser(context))) return notFound()
      let file
      try {
        file = openLazyFile(filePath)
      } catch {
        return notFound()
      }
      // Approved images: cached for an hour, not forever, so deleting one
      // takes effect at Cloudflare soon after. Pending or rejected ones are
      // only for the uploader and admins, so they're never cached.
      return createFileResponse(file, context.request, {
        cacheControl:
          background.status === 'approved' ? 'public, max-age=3600' : 'private, no-store',
      })
    },
  },
})
