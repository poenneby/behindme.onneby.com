import type { Handle } from 'remix/component'

import type { AccountSummary } from '../../data/admin.ts'
import type { Identity } from '../../data/users.ts'
import { routes } from '../../routes.ts'
import { Document } from '../document.tsx'

function date(ms: number | null) {
  if (ms === null) return '—'
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function status(account: AccountSummary) {
  if (account.disabledAt !== null) return { label: 'Disabled', tone: 'bad' }
  if (account.verifiedAt === null) return { label: 'Not activated', tone: 'warn' }
  return { label: 'Active', tone: 'ok' }
}

export function AdminUsersPage(
  handle: Handle<{
    user: Identity
    accounts: AccountSummary[]
    search: string
    notice?: string
  }>,
) {
  return () => {
    let { user, accounts, search, notice } = handle.props
    return (
      <Document user={user} title="Users" section="admin">
        <div class="hero">
          <h1>Users</h1>
          <p>
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
            {search ? ` matching “${search}”` : ''}. Disabling an account logs it out at once.
          </p>
        </div>
        {notice ? (
          <p class="notice" role="status">
            {notice}
          </p>
        ) : null}
        <form
          class="row"
          method="get"
          action={routes.admin.users.href()}
          style={{ margin: '16px 0' }}
        >
          <input
            class="search"
            type="search"
            name="q"
            placeholder="Search by name or email"
            defaultValue={search}
            aria-label="Search users"
          />
          <button class="btn" type="submit">
            Search
          </button>
        </form>
        <div class="table-wrap">
          <table class="users">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Uploads</th>
                <th>Joined</th>
                <th>Last login</th>
                <th>
                  <span class="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  self={account.id === user.id}
                  search={search}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Document>
    )
  }
}

function Action(
  handle: Handle<{
    href: string
    label: string
    search: string
    danger?: boolean
    fields?: Record<string, string>
  }>,
) {
  return () => {
    let { href, label, search, danger, fields = {} } = handle.props
    return (
      <form method="post" action={href}>
        <input type="hidden" name="q" value={search} />
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button class={danger ? 'btn btn-small btn-danger' : 'btn btn-small'} type="submit">
          {label}
        </button>
      </form>
    )
  }
}

function AccountRow(handle: Handle<{ account: AccountSummary; self: boolean; search: string }>) {
  return () => {
    let { account, self, search } = handle.props
    let state = status(account)
    let id = { id: account.id }
    let locked = self || account.builtInAdmin
    return (
      <tr>
        <td class="cell-name">
          <strong>{account.name}</strong>
          {self ? <span class="muted small"> (you)</span> : null}
          <div class="muted small">{account.email}</div>
        </td>
        <td data-label="Role">
          {account.role === 'admin' ? 'Admin' : 'Member'}
          {account.builtInAdmin ? <div class="muted small">built-in</div> : null}
        </td>
        <td data-label="Status">
          <span class={`pill pill-${state.tone}`}>{state.label}</span>
          {account.otherDomain ? (
            <div class="muted small" title="Not on an allowed email domain">
              Other domain
            </div>
          ) : null}
        </td>
        <td data-label="Uploads">{account.uploads}</td>
        <td data-label="Joined">{date(account.createdAt)}</td>
        <td data-label="Last login">{date(account.lastLoginAt)}</td>
        <td class="cell-actions">
          <div class="actions">
            {!locked ? (
              account.role === 'admin' ? (
                <Action
                  href={routes.admin.role.href(id)}
                  label="Remove admin"
                  search={search}
                  fields={{ role: 'member' }}
                />
              ) : (
                <Action
                  href={routes.admin.role.href(id)}
                  label="Make admin"
                  search={search}
                  fields={{ role: 'admin' }}
                />
              )
            ) : null}
            {!self && account.verifiedAt === null ? (
              <Action href={routes.admin.activate.href(id)} label="Activate" search={search} />
            ) : null}
            {!self && account.disabledAt === null ? (
              <Action
                href={routes.admin.sendReset.href(id)}
                label="Send reset link"
                search={search}
              />
            ) : null}
            {!locked ? (
              account.disabledAt === null ? (
                <Action
                  href={routes.admin.disable.href(id)}
                  label="Disable"
                  search={search}
                  danger
                />
              ) : (
                <Action href={routes.admin.enable.href(id)} label="Enable" search={search} />
              )
            ) : null}
            {!locked ? (
              <a class="btn btn-small btn-danger" href={routes.admin.deleteForm.href(id)}>
                Delete…
              </a>
            ) : null}
          </div>
        </td>
      </tr>
    )
  }
}

export function DeleteAccountPage(handle: Handle<{ user: Identity; account: AccountSummary }>) {
  return () => {
    let { user, account } = handle.props
    return (
      <Document user={user} title="Delete account" section="admin">
        <form
          class="form form-narrow"
          method="post"
          action={routes.admin.destroy.href({ id: account.id })}
        >
          <h1>Delete {account.name}’s account?</h1>
          <p>
            This deletes <strong>{account.email}</strong>, their{' '}
            {account.uploads === 1 ? '1 background' : `${account.uploads} backgrounds`} and their
            ratings. It can’t be undone. To keep their backgrounds, disable the account instead.
          </p>
          <div class="row">
            <button class="btn btn-danger" type="submit">
              Delete account
            </button>
            <a class="btn btn-ghost" href={routes.admin.users.href()}>
              Cancel
            </a>
          </div>
        </form>
      </Document>
    )
  }
}
