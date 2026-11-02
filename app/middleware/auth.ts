import { auth, createSessionAuthScheme, requireAuth } from 'remix/middleware/auth'
import { redirect } from 'remix/response/redirect'

import { db } from '../db.ts'
import { getIdentity, type Identity } from '../data/users.ts'
import { routes } from '../routes.ts'

export interface AuthRecord {
  userId: string
}

/** Resolves `context.auth` from the session on every request. */
export function loadAuth() {
  return auth({
    schemes: [
      createSessionAuthScheme({
        read(session) {
          return (session.get('auth') as AuthRecord | undefined) ?? null
        },
        verify(value) {
          return getIdentity(db, value.userId)
        },
        invalidate(session) {
          session.unset('auth')
        },
      }),
    ],
  })
}

/** Sends anonymous visitors to the login page, then back where they were. */
export function requireUser() {
  return requireAuth<Identity>({
    onFailure(context) {
      let returnTo = context.url.pathname + context.url.search
      // Only redirect back to the page for GETs; a POST target isn't a page.
      let target = context.request.method === 'GET' ? returnTo : '/'
      return redirect(routes.auth.loginForm.href(null, { searchParams: { returnTo: target } }))
    },
  })
}

/** Accepts only same-site relative paths, so `returnTo` can't send users elsewhere. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}
