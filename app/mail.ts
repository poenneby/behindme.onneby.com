import nodemailer from 'nodemailer'

import { config } from './config.ts'

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

/** Emails "sent" while testing, newest last. */
export const outbox: Mail[] = []

const transport = config.smtpUrl ? nodemailer.createTransport(config.smtpUrl) : null

/**
 * Sends an email over SMTP. Without SMTP_URL (development and tests only;
 * production refuses to start without it) the email is printed or kept in
 * `outbox`. Returns false if the SMTP server refused it.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (process.env.NODE_ENV === 'test') {
    outbox.push(mail)
    return true
  }
  if (!transport) {
    console.log(`\n--- email to ${mail.to}: ${mail.subject}\n${mail.text}\n---\n`)
    return true
  }
  try {
    await transport.sendMail({ from: config.mailFrom, ...mail })
    return true
  } catch (error) {
    console.error(`Couldn't send "${mail.subject}" to ${mail.to}:`, error)
    return false
  }
}
