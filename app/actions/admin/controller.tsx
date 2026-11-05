import type { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { notifyDecision, sendReset } from '../../account-mail.ts'
import {
  activateAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  setDisabled,
  setRole,
  type AccountSummary,
} from '../../data/admin.ts'
import {
  deleteBackground,
  getBackground,
  listAllCategories,
  listBackgrounds,
  renameCategory,
  reviewBackground,
} from '../../data/catalog.ts'
import { dismissReports, listOpenReports } from '../../data/reports.ts'
import { getUser, type Role } from '../../data/users.ts'
import { deleteImages } from '../../images.ts'
import { requireAdmin } from '../../middleware/auth.ts'
import { routes } from '../../routes.ts'
import { signedInUser } from '../../ui/current-user.ts'
import { AdminUsersPage, DeleteAccountPage } from './pages.tsx'
import { AdminCategoriesPage, ReviewPage } from './review-pages.tsx'

/** What the account actions below use from the request context. */
interface ActionContext {
  db: Database
  params: { id: string }
  auth: { ok: boolean; identity?: unknown }
  session: { flash(key: string, value: unknown): void }
  formData: FormData
}

/** Back to the users page, keeping the search, with a one-off message. */
function done(context: ActionContext, notice: string) {
  context.session.flash('adminNotice', notice)
  let q = String(context.formData.get('q') ?? '')
  return redirect(routes.admin.users.href(null, { searchParams: q ? { q } : {} }), 303)
}

/**
 * The account an action targets, or a reason it can't be changed: nobody
 * can change their own account here, and accounts in ADMIN_EMAILS can't be
 * demoted, disabled or deleted, so admins can't lock everyone out.
 */
async function target(
  context: ActionContext,
  { allowBuiltIn = false } = {},
): Promise<{ account: AccountSummary } | { refusal: string } | null> {
  let account = await getAccount(context.db, context.params.id)
  if (!account) return null
  if (account.id === signedInUser(context).id) {
    return { refusal: 'You can’t change your own account here.' }
  }
  if (account.builtInAdmin && !allowBuiltIn) {
    return {
      refusal: `${account.email} is a built-in admin (ADMIN_EMAILS) and can’t be changed here.`,
    }
  }
  return { account }
}

const notFound = () => new Response('Not Found', { status: 404 })

/** Back to an admin page with a one-off message. */
function backTo(
  context: { session: { flash(key: string, value: unknown): void } },
  href: string,
  notice: string,
) {
  context.session.flash('adminNotice', notice)
  return redirect(href, 303)
}

export default createController(routes.admin, {
  middleware: [requireAdmin()],
  actions: {
    async review(context) {
      let notice = context.session.get('adminNotice')
      let pending = await listBackgrounds(context.db, { status: 'pending', sort: 'new' })
      let reports = await listOpenReports(context.db)
      let reported = []
      for (let report of reports) {
        let background = await getBackground(context.db, report.backgroundId)
        if (background) reported.push({ background, reasons: report.reasons })
      }
      return context.render(
        <ReviewPage
          user={signedInUser(context)}
          pending={pending.reverse()}
          reported={reported}
          notice={typeof notice === 'string' ? notice : undefined}
        />,
      )
    },

    async approve(context) {
      let background = await getBackground(context.db, context.params.id)
      if (!background) return notFound()
      await reviewBackground(context.db, background.id, {
        status: 'approved',
        reviewerId: signedInUser(context).id,
      })
      let uploader = await getUser(context.db, background.userId)
      if (uploader) await notifyDecision(uploader, background, { status: 'approved' })
      return backTo(context, routes.admin.review.href(), `Approved “${background.title}”.`)
    },

    async reject(context) {
      let background = await getBackground(context.db, context.params.id)
      if (!background) return notFound()
      let reason = String(context.formData.get('reason') ?? '')
        .trim()
        .slice(0, 300)
      await reviewBackground(context.db, background.id, {
        status: 'rejected',
        reviewerId: signedInUser(context).id,
        reason,
      })
      let uploader = await getUser(context.db, background.userId)
      if (uploader) await notifyDecision(uploader, background, { status: 'rejected', reason })
      return backTo(
        context,
        routes.admin.review.href(),
        `Didn’t approve “${background.title}”. ${background.authorName} has been told.`,
      )
    },

    async dismissReports(context) {
      let background = await getBackground(context.db, context.params.id)
      if (!background) return notFound()
      await dismissReports(context.db, background.id)
      return backTo(
        context,
        routes.admin.review.href(),
        `Kept “${background.title}” and closed its reports.`,
      )
    },

    async removeReported(context) {
      let background = await getBackground(context.db, context.params.id)
      if (!background) return notFound()
      await deleteBackground(context.db, background.id)
      await deleteImages(background.id)
      return backTo(context, routes.admin.review.href(), `Removed “${background.title}”.`)
    },

    async categories(context) {
      let notice = context.session.get('adminNotice')
      return context.render(
        <AdminCategoriesPage
          user={signedInUser(context)}
          categories={await listAllCategories(context.db)}
          notice={typeof notice === 'string' ? notice : undefined}
        />,
      )
    },

    async renameCategory(context) {
      let name = String(context.formData.get('name') ?? '').trim()
      let back = routes.admin.categories.href()
      if (name.length < 2 || name.length > 60) {
        return backTo(context, back, 'Category names need 2–60 characters.')
      }
      let before = await listAllCategories(context.db)
      let old = before.find((category) => category.slug === context.params.slug)
      let outcome = await renameCategory(context.db, context.params.slug, name)
      if (!outcome || !old) return notFound()
      let message =
        outcome.result === 'merged'
          ? `Moved ${old.count} ${old.count === 1 ? 'background' : 'backgrounds'} from “${old.name}” into “${outcome.category.name}”.`
          : outcome.result === 'renamed'
            ? `Renamed “${old.name}” to “${outcome.category.name}”.`
            : 'Nothing to change.'
      return backTo(context, back, message)
    },

    async users(context) {
      let search = context.url.searchParams.get('q') ?? ''
      let notice = context.session.get('adminNotice')
      return context.render(
        <AdminUsersPage
          user={signedInUser(context)}
          accounts={await listAccounts(context.db, search)}
          search={search}
          notice={typeof notice === 'string' ? notice : undefined}
        />,
      )
    },

    async role(context) {
      let found = await target(context)
      if (!found) return notFound()
      if ('refusal' in found) return done(context, found.refusal)
      let role: Role = context.formData.get('role') === 'admin' ? 'admin' : 'member'
      await setRole(context.db, found.account.id, role)
      return done(
        context,
        role === 'admin'
          ? `${found.account.name} is now an admin.`
          : `${found.account.name} is no longer an admin.`,
      )
    },

    async disable(context) {
      let found = await target(context)
      if (!found) return notFound()
      if ('refusal' in found) return done(context, found.refusal)
      await setDisabled(context.db, found.account.id, true)
      return done(context, `${found.account.name}’s account is disabled and logged out.`)
    },

    async enable(context) {
      let found = await target(context)
      if (!found) return notFound()
      if ('refusal' in found) return done(context, found.refusal)
      await setDisabled(context.db, found.account.id, false)
      return done(context, `${found.account.name}’s account is enabled again.`)
    },

    async activate(context) {
      let found = await target(context, { allowBuiltIn: true })
      if (!found) return notFound()
      if ('refusal' in found) return done(context, found.refusal)
      await activateAccount(context.db, found.account.id)
      return done(context, `${found.account.name}’s account is activated. They can log in now.`)
    },

    async sendReset(context) {
      let found = await target(context, { allowBuiltIn: true })
      if (!found) return notFound()
      if ('refusal' in found) return done(context, found.refusal)
      if (found.account.disabledAt !== null) {
        return done(context, `${found.account.name}’s account is disabled. Enable it first.`)
      }
      let sent = await sendReset(context.db, found.account)
      return done(
        context,
        sent
          ? `Sent a password-reset link to ${found.account.email}.`
          : `Couldn’t send the email to ${found.account.email}. Try again in a minute.`,
      )
    },

    async deleteForm(context) {
      let account = await getAccount(context.db, context.params.id)
      if (!account) return notFound()
      return context.render(<DeleteAccountPage user={signedInUser(context)} account={account} />)
    },

    async destroy(context) {
      let found = await target(context)
      if (!found) return notFound()
      if ('refusal' in found) return done(context, found.refusal)
      await deleteAccount(context.db, found.account.id)
      return done(
        context,
        `Deleted ${found.account.email} and ${found.account.uploads} ${found.account.uploads === 1 ? 'background' : 'backgrounds'}.`,
      )
    },
  },
})
