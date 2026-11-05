import type { Database } from 'remix/data-table'

import { config } from './config.ts'
import { listAdminRecipients } from './data/admin.ts'
import { createToken } from './data/tokens.ts'
import {
  activationEmail,
  approvedEmail,
  notApprovedEmail,
  reportedEmail,
  resetEmail,
  reviewNeededEmail,
} from './emails.ts'
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

/** Tells every admin a new upload is waiting. Failures are logged, not fatal. */
export async function notifyReviewNeeded(
  db: Database,
  background: { title: string },
  uploader: { name: string },
) {
  let url = link(routes.admin.review.href())
  for (let admin of await listAdminRecipients(db)) {
    await sendMail(reviewNeededEmail(admin.email, admin.name, background.title, uploader.name, url))
  }
}

export async function notifyReported(
  db: Database,
  background: { title: string },
  reason: string,
  reporterId: string,
) {
  let url = link(routes.admin.review.href())
  for (let admin of await listAdminRecipients(db)) {
    if (admin.id === reporterId) continue
    await sendMail(reportedEmail(admin.email, admin.name, background.title, reason, url))
  }
}

/** Tells the uploader what an admin decided. */
export async function notifyDecision(
  uploader: Recipient,
  background: { id: string; title: string },
  decision: { status: 'approved' | 'rejected'; reason?: string },
) {
  let url = link(routes.backgrounds.show.href({ id: background.id }))
  await sendMail(
    decision.status === 'approved'
      ? approvedEmail(uploader.email, uploader.name, background.title, url)
      : notApprovedEmail(
          uploader.email,
          uploader.name,
          background.title,
          decision.reason?.trim() || null,
          url,
        ),
  )
}
