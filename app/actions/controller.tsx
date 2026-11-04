import { openLazyFile } from 'remix/fs'
import { createFileResponse } from 'remix/response/file'
import { createController } from 'remix/router'

import { assets } from '../assets.ts'
import { listBackgrounds, listCategories, type Sort } from '../data/catalog.ts'
import { resolveImagePath } from '../images.ts'
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
      let filePath = resolveImagePath(context.params.file)
      if (!filePath) return new Response('Not Found', { status: 404 })
      let file
      try {
        file = openLazyFile(filePath)
      } catch {
        return new Response('Not Found', { status: 404 })
      }
      // Cached for an hour, not forever: when a background is deleted (by its
      // owner or an admin), Cloudflare and browsers stop serving it soon after.
      return createFileResponse(file, context.request, {
        cacheControl: 'public, max-age=3600',
      })
    },
  },
})
