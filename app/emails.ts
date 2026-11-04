import { html } from 'remix/html-template'

import type { Mail } from './mail.ts'

const APP = 'Behind Me'

function layout(heading: string, body: string, buttonLabel: string, url: string, footer: string) {
  return String(
    html`<!doctype html>
      <html>
        <body
          style="margin:0;padding:24px;background:#f6f5f2;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1c1b19"
        >
          <div
            style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:28px"
          >
            <p style="margin:0 0 16px;font-weight:700">${APP}</p>
            <h1 style="margin:0 0 12px;font-size:22px">${heading}</h1>
            <p style="margin:0 0 20px;line-height:1.5">${body}</p>
            <p style="margin:0 0 20px">
              <a
                href="${url}"
                style="display:inline-block;background:#c8102e;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px"
                >${buttonLabel}</a
              >
            </p>
            <p style="margin:0;font-size:13px;color:#6b6862;line-height:1.5">
              ${footer}<br />${url}
            </p>
          </div>
        </body>
      </html>`,
  )
}

export function activationEmail(to: string, name: string, url: string): Mail {
  let body = `Hi ${name}, confirm this is your email address to finish creating your account.`
  let footer =
    'The link works once and expires in 24 hours. If you didn’t sign up, ignore this email.'
  return {
    to,
    subject: `Activate your ${APP} account`,
    text: `${body}\n\nActivate your account:\n${url}\n\n${footer}\n`,
    html: layout('Activate your account', body, 'Activate my account', url, footer),
  }
}

export function resetEmail(to: string, name: string, url: string): Mail {
  let body = `Hi ${name}, someone asked to reset the password for your account. If it was you, choose a new one.`
  let footer =
    'The link works once and expires in 1 hour. If you didn’t ask for this, ignore this email; your password stays the same.'
  return {
    to,
    subject: `Reset your ${APP} password`,
    text: `${body}\n\nChoose a new password:\n${url}\n\n${footer}\n`,
    html: layout('Reset your password', body, 'Choose a new password', url, footer),
  }
}
