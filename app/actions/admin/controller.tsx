import type { Database } from 'remix/data-table'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'

import { sendReset } from '../../account-mail.ts'
import {
  activateAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  setDisabled,
  setRole,
  type AccountSummary,
} from '../../data/admin.ts'
import type { Role } from '../../data/users.ts'
import { requireAdmin } from '../../middleware/auth.ts'
import { routes } from '../../routes.ts'
import { signedInUser } from '../../ui/current-user.ts'
import { AdminUsersPage, DeleteAccountPage } from './pages.tsx'

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

export default createController(routes.admin, {
  middleware: [requireAdmin()],
  actions: {
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
