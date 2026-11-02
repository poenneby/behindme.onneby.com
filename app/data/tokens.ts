import { createHash, randomBytes } from 'node:crypto'
import { sql } from 'remix/data-table'
import type { Database } from 'remix/data-table'

import { authTokens } from './tables.ts'

export type TokenPurpose = 'verify' | 'reset'

const LIFETIME_MS: Record<TokenPurpose, number> = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
}

/** At most one email of each kind per account per minute. */
const RESEND_AFTER_MS = 60 * 1000

function hash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Creates a one-time link token, or returns null if one of this kind was
 * sent in the last minute (so nobody can flood an inbox).
 */
export async function createToken(
  db: Database,
  userId: string,
  purpose: TokenPurpose,
): Promise<string | null> {
  let now = Date.now()
  let recent = await db.exec(sql`
    select 1 from auth_tokens
    where user_id = ${userId} and purpose = ${purpose} and created_at > ${now - RESEND_AFTER_MS}
    limit 1
  `)
  if (recent.rows?.length) return null

  let token = randomBytes(32).toString('base64url')
  await db.create(authTokens, {
    id: hash(token),
    user_id: userId,
    purpose,
    expires_at: now + LIFETIME_MS[purpose],
    used_at: null,
    created_at: now,
  })
  return token
}

/** The account a token belongs to, if it's still usable. Doesn't use it up. */
export async function checkToken(
  db: Database,
  token: string,
  purpose: TokenPurpose,
): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  let row = await db.find(authTokens, hash(token))
  if (!row || row.purpose !== purpose || row.used_at !== null || row.expires_at < Date.now()) {
    return null
  }
  return row.user_id
}

/**
 * Uses a token up and returns its account. Every other unused token of the
 * same kind for that account stops working too.
 */
export async function useToken(
  db: Database,
  token: string,
  purpose: TokenPurpose,
): Promise<string | null> {
  let userId = await checkToken(db, token, purpose)
  if (!userId) return null
  await db.exec(sql`
    update auth_tokens set used_at = ${Date.now()}
    where user_id = ${userId} and purpose = ${purpose} and used_at is null
  `)
  return userId
}
