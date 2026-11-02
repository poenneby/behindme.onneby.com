import { openLazyFile } from 'remix/fs'
import { createFileResponse } from 'remix/response/file'
import { createController } from 'remix/router'

import { assets } from '../assets.ts'
import { listBackgrounds, listLocations, type Sort } from '../data/catalog.ts'
import { resolveImagePath } from '../images.ts'
import { routes } from '../routes.ts'
import { currentUser } from '../ui/current-user.ts'
import { HomePage } from './home-page.tsx'
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
      let [items, locations] = await Promise.all([
        listBackgrounds(context.db, { sort }),
        listLocations(context.db),
      ])
      return context.render(
        <HomePage user={currentUser(context)} items={items} locations={locations} sort={sort} />,
      )
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
      // Ids are never reused, so an image URL always means the same bytes.
      return createFileResponse(file, context.request, {
        cacheControl: 'public, max-age=31536000, immutable',
      })
    },
  },
})
