import * as path from 'node:path'

const nodeEnv = process.env.NODE_ENV ?? 'development'
const isProduction = nodeEnv === 'production'

function required(name: string, devDefault: string): string {
  let value = process.env[name]
  if (value) return value
  if (isProduction) {
    throw new Error(`Missing required environment variable ${name}`)
  }
  return devDefault
}

export const config = {
  isProduction,
  port: process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 44100,
  /** Holds the SQLite database and processed images. Mount a volume here. */
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  sessionSecret: required('SESSION_SECRET', 'dev-only-session-secret'),
  /**
   * Absolute origin used in install scripts. Scripts are piped into a shell,
   * so their URLs must never come from the request's Host header.
   */
  publicOrigin: new URL(required('PUBLIC_ORIGIN', 'http://localhost:44100')).origin,
  /**
   * Where activation and password-reset emails are sent from, e.g.
   * smtps://user:password@smtp.example.com:465. Outside production, emails
   * are printed to the console instead.
   */
  smtpUrl: required('SMTP_URL', ''),
  mailFrom: required('MAIL_FROM', 'Behind Me <noreply@localhost>'),
  /**
   * Comma-separated emails of accounts that are always admins. This is how
   * the first admin exists, and these accounts can't be demoted or disabled
   * from the website, so nobody can lock everyone out.
   */
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
}
