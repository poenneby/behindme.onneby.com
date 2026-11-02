import { createController } from 'remix/router'

import { config } from '../../config.ts'
import { countDownload, getLocation, listBackgrounds, listLocations } from '../../data/catalog.ts'
import { routes } from '../../routes.ts'
import {
  macCommand,
  macScript,
  scriptResponse,
  windowsCommand,
  windowsScript,
} from '../../teams.ts'
import { currentUser } from '../../ui/current-user.ts'
import { LocationPage, LocationsPage } from './pages.tsx'

function absolute(href: string) {
  return new URL(href, config.publicOrigin).href
}

export default createController(routes.locations, {
  actions: {
    async index(context) {
      let locations = await listLocations(context.db)
      return context.render(<LocationsPage user={currentUser(context)} locations={locations} />)
    },

    async show(context) {
      let location = await getLocation(context.db, context.params.slug)
      if (!location) return new Response('Not Found', { status: 404 })
      let items = await listBackgrounds(context.db, { locationSlug: location.slug })
      let windowsHref = routes.locations.windows.href({ slug: location.slug })
      let macHref = routes.locations.mac.href({ slug: location.slug })
      return context.render(
        <LocationPage
          user={currentUser(context)}
          name={location.name}
          slug={location.slug}
          items={items}
          windowsCommand={windowsCommand(absolute(windowsHref))}
          macCommand={macCommand(absolute(macHref))}
          windowsScriptHref={windowsHref}
          macScriptHref={macHref}
        />,
      )
    },

    async windows(context) {
      let items = await listBackgrounds(context.db, { locationSlug: context.params.slug })
      if (items.length === 0) return new Response('Not Found', { status: 404 })
      await countDownload(
        context.db,
        items.map((item) => item.id),
      )
      return scriptResponse(windowsScript(items), 'windows')
    },

    async mac(context) {
      let items = await listBackgrounds(context.db, { locationSlug: context.params.slug })
      if (items.length === 0) return new Response('Not Found', { status: 404 })
      await countDownload(
        context.db,
        items.map((item) => item.id),
      )
      return scriptResponse(macScript(items), 'mac')
    },
  },
})
