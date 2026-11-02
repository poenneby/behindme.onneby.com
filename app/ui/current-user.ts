import type { Identity } from '../data/users.ts'

/** The signed-in user for this request, or null. */
export function currentUser(context: {
  auth: { ok: boolean; identity?: unknown }
}): Identity | null {
  return context.auth.ok ? (context.auth.identity as Identity) : null
}

/** The signed-in user in an action guarded by `requireUser()`. */
export function signedInUser(context: { auth: { ok: boolean; identity?: unknown } }): Identity {
  let user = currentUser(context)
  if (!user) throw new Error('signedInUser() used on a route without requireUser()')
  return user
}
