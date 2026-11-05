import { rawSql, sql } from 'remix/data-table'
import type { Database } from 'remix/data-table'

import { deleteImages } from '../images.ts'
import { deleteBackground } from './catalog.ts'
import { users } from './tables.ts'
import { emailDomainAllowed, isBuiltInAdmin, markVerified, type Role } from './users.ts'

export interface AccountSummary {
  id: string
  email: string
  name: string
  role: Role
  builtInAdmin: boolean
  /** Not on an ALLOWED_EMAIL_DOMAINS domain (made before the rule, say). */
  otherDomain: boolean
  createdAt: number
  verifiedAt: number | null
  disabledAt: number | null
  lastLoginAt: number | null
  uploads: number
}

function toSummary(row: Record<string, unknown>): AccountSummary {
  let email = String(row.email)
  let builtInAdmin = isBuiltInAdmin(email)
  return {
    id: String(row.id),
    email,
    name: String(row.name),
    role: builtInAdmin || row.role === 'admin' ? 'admin' : 'member',
    builtInAdmin,
    otherDomain: !emailDomainAllowed(email),
    createdAt: Number(row.created_at),
    verifiedAt: row.verified_at === null ? null : Number(row.verified_at),
    disabledAt: row.disabled_at === null ? null : Number(row.disabled_at),
    lastLoginAt: row.last_login_at === null ? null : Number(row.last_login_at),
    uploads: Number(row.uploads),
  }
}

const SELECT = `
  select u.id, u.email, u.name, u.role, u.created_at, u.verified_at, u.disabled_at,
    u.last_login_at, (select count(*) from backgrounds b where b.user_id = u.id) as uploads
  from users u
`

/** Every account, newest first, optionally filtered by name or email. */
export async function listAccounts(db: Database, search = ''): Promise<AccountSummary[]> {
  let term = search.trim().toLowerCase()
  let result = term
    ? await db.exec(
        rawSql(
          `${SELECT} where lower(u.email) like ? or lower(u.name) like ? order by u.created_at desc limit 500`,
          [`%${term}%`, `%${term}%`],
        ),
      )
    : await db.exec(rawSql(`${SELECT} order by u.created_at desc limit 500`, []))
  return (result.rows ?? []).map(toSummary)
}

export async function getAccount(db: Database, id: string): Promise<AccountSummary | null> {
  let result = await db.exec(rawSql(`${SELECT} where u.id = ?`, [id]))
  let row = result.rows?.[0]
  return row ? toSummary(row) : null
}

export async function setRole(db: Database, id: string, role: Role) {
  await db.update(users, id, { role })
}

/** Disabling also ends the account's sessions. */
export async function setDisabled(db: Database, id: string, disabled: boolean) {
  if (disabled) {
    await db.exec(sql`
      update users set disabled_at = ${Date.now()}, session_version = session_version + 1
      where id = ${id}
    `)
  } else {
    await db.update(users, id, { disabled_at: null })
  }
}

export async function activateAccount(db: Database, id: string) {
  await markVerified(db, id)
}

/** Deletes an account with its backgrounds (and their images) and ratings. */
export async function deleteAccount(db: Database, id: string) {
  let owned = await db.exec(sql`select id from backgrounds where user_id = ${id}`)
  for (let row of owned.rows ?? []) {
    let backgroundId = String(row.id)
    await deleteBackground(db, backgroundId)
    await deleteImages(backgroundId)
  }
  // Ratings and one-time tokens go with the account (on delete cascade).
  await db.delete(users, id)
}

/** Active admins to email about new uploads and reports. */
export async function listAdminRecipients(
  db: Database,
): Promise<{ id: string; email: string; name: string }[]> {
  let result = await db.exec(sql`
    select id, email, name, role from users
    where verified_at is not null and disabled_at is null
  `)
  return (result.rows ?? [])
    .filter((row) => row.role === 'admin' || isBuiltInAdmin(String(row.email)))
    .map((row) => ({ id: String(row.id), email: String(row.email), name: String(row.name) }))
}
