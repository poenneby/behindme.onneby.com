import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { config } from '../../config.ts'
import { countDownload, getCategory, listBackgrounds, listCategories } from '../../data/catalog.ts'
import { routes } from '../../routes.ts'
import {
  macCommand,
  macScript,
  scriptResponse,
  windowsCommand,
  windowsScript,
} from '../../teams.ts'
import { currentUser } from '../../ui/current-user.ts'
import { CategoryPage, CategoriesPage } from './pages.tsx'

function absolute(href: string) {
  return new URL(href, config.publicOrigin).href
}

export default createController(routes.categories, {
  actions: {
    async index(context) {
      let categories = await listCategories(context.db)
      return context.render(<CategoriesPage user={currentUser(context)} categories={categories} />)
    },

    async show(context) {
      let category = await getCategory(context.db, context.params.slug)
      if (!category) return new Response('Not Found', { status: 404 })
      let items = await listBackgrounds(context.db, { categorySlug: category.slug })
      let windowsHref = routes.categories.windows.href({ slug: category.slug })
      let macHref = routes.categories.mac.href({ slug: category.slug })
      return context.render(
        <CategoryPage
          user={currentUser(context)}
          name={category.name}
          slug={category.slug}
          items={items}
          windowsCommand={windowsCommand(absolute(windowsHref))}
          macCommand={macCommand(absolute(macHref))}
          windowsScriptHref={windowsHref}
          macScriptHref={macHref}
        />,
      )
    },

    async windows(context) {
      let items = await listBackgrounds(context.db, { categorySlug: context.params.slug })
      if (items.length === 0) return new Response('Not Found', { status: 404 })
      await countDownload(
        context.db,
        items.map((item) => item.id),
      )
      return scriptResponse(windowsScript(items), 'windows')
    },

    async mac(context) {
      let items = await listBackgrounds(context.db, { categorySlug: context.params.slug })
      if (items.length === 0) return new Response('Not Found', { status: 404 })
      await countDownload(
        context.db,
        items.map((item) => item.id),
      )
      return scriptResponse(macScript(items), 'mac')
    },

    // Old office addresses: permanent redirects. Install commands follow
    // them (`irm` and `curl -L` both do).
    oldIndex() {
      return redirect(routes.categories.index.href(), 301)
    },
    oldShow(context) {
      return redirect(routes.categories.show.href({ slug: context.params.slug }), 301)
    },
    oldWindows(context) {
      return redirect(routes.categories.windows.href({ slug: context.params.slug }), 301)
    },
    oldMac(context) {
      return redirect(routes.categories.mac.href({ slug: context.params.slug }), 301)
    },
  },
})
