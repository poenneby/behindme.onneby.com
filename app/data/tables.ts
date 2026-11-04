import { column as c, table } from 'remix/data-table'
import type { TableRow } from 'remix/data-table'

export const users = table({
  name: 'users',
  columns: {
    id: c.text(),
    email: c.text(),
    name: c.text(),
    password_hash: c.text(),
    created_at: c.integer(),
    /** When the account was activated from the emailed link; null until then. */
    verified_at: c.integer().nullable(),
    /** Bumped on password reset, which logs out every other session. */
    session_version: c.integer(),
    /** 'member' or 'admin'. Accounts in ADMIN_EMAILS are admins regardless. */
    role: c.text(),
    /** Set when an admin disables the account; null while it's active. */
    disabled_at: c.integer().nullable(),
    last_login_at: c.integer().nullable(),
  },
})

export const authTokens = table({
  name: 'auth_tokens',
  columns: {
    /** SHA-256 of the token in the link, hex. The token itself isn't stored. */
    id: c.text(),
    user_id: c.text(),
    purpose: c.text(),
    expires_at: c.integer(),
    used_at: c.integer().nullable(),
    created_at: c.integer(),
  },
})

export const categories = table({
  name: 'categories',
  columns: {
    id: c.text(),
    slug: c.text(),
    name: c.text(),
    created_at: c.integer(),
  },
})

export const backgrounds = table({
  name: 'backgrounds',
  columns: {
    id: c.text(),
    user_id: c.text(),
    category_id: c.text(),
    title: c.text(),
    description: c.text(),
    teams_guid: c.text(),
    downloads: c.integer(),
    created_at: c.integer(),
    /** 1 for an animated GIF, 0 for a still photo. */
    animated: c.integer(),
  },
})

export const ratings = table({
  name: 'ratings',
  primaryKey: ['background_id', 'user_id'],
  columns: {
    background_id: c.text(),
    user_id: c.text(),
    stars: c.integer(),
    created_at: c.integer(),
  },
})

export type User = TableRow<typeof users>
export type Category = TableRow<typeof categories>
export type Background = TableRow<typeof backgrounds>
