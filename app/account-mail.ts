import type { Database } from 'remix/data-table'

import { config } from './config.ts'
import { createToken } from './data/tokens.ts'
import { activationEmail, resetEmail } from './emails.ts'
import { sendMail } from './mail.ts'
import { routes } from './routes.ts'

interface Recipient {
  id: string
  email: string
  name: string
}

function link(path: string) {
  return new URL(path, config.publicOrigin).href
}

/**
 * Emails a fresh activation link. Returns false only if the SMTP server
 * refused it; a link sent in the last minute counts as sent.
 */
export async function sendActivation(db: Database, user: Recipient): Promise<boolean> {
  let token = await createToken(db, user.id, 'verify')
  if (!token) return true
  let url = link(routes.auth.verifyForm.href({ token }))
  return sendMail(activationEmail(user.email, user.name, url))
}

/** Emails a password-reset link, with the same rules as `sendActivation`. */
export async function sendReset(db: Database, user: Recipient): Promise<boolean> {
  let token = await createToken(db, user.id, 'reset')
  if (!token) return true
  let url = link(routes.auth.resetForm.href({ token }))
  return sendMail(resetEmail(user.email, user.name, url))
}
