import { completeAuth } from 'remix/auth'
import type { Database } from 'remix/data-table'
import * as s from 'remix/data-schema'
import * as checks from 'remix/data-schema/checks'
import * as f from 'remix/data-schema/form-data'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'
import type { Session } from 'remix/session'

import { sendActivation, sendReset } from '../../account-mail.ts'
import { checkToken, useToken } from '../../data/tokens.ts'
import {
  allowedDomainsText,
  createUser,
  emailDomainAllowed,
  findUserByEmail,
  getUser,
  markVerified,
  recordLogin,
  resetPassword,
  verifyLogin,
} from '../../data/users.ts'
import { safeReturnTo } from '../../middleware/auth.ts'
import { routes } from '../../routes.ts'
import type { FieldErrors } from '../../ui/field.tsx'
import {
  CheckEmailPage,
  ForgotPage,
  LinkExpiredPage,
  LoginPage,
  ResetPage,
  SignupPage,
  VerifyPage,
  type CheckEmailInfo,
} from './pages.tsx'

const trimmed = s.string().transform((value) => value.trim())
const password = s.string().pipe(checks.minLength(10), checks.maxLength(200))

const signupForm = f.object({
  name: f.field(trimmed.pipe(checks.minLength(1), checks.maxLength(60))),
  email: f.field(trimmed.pipe(checks.email())),
  password: f.field(password),
})

function issueField(issue: { path?: ReadonlyArray<unknown> }) {
  let first = issue.path?.[0]
  return typeof first === 'object' && first !== null && 'key' in first
    ? String((first as { key: unknown }).key)
    : String(first ?? 'form')
}

const MESSAGES: Record<string, string> = {
  name: 'Enter your name.',
  email: 'Enter a valid email address.',
  password: 'Use at least 10 characters.',
}

/** Pages that carry a token in their URL shouldn't leak it to other sites. */
const TOKEN_PAGE = { headers: { 'Referrer-Policy': 'no-referrer' } }

function showCheckEmail(session: Session, info: CheckEmailInfo) {
  session.flash('checkEmail', info)
  return redirect(routes.auth.checkEmail.href(), 303)
}

async function logIn(
  context: Parameters<typeof completeAuth>[0] & { db: Database },
  userId: string,
  version: number,
) {
  let session = completeAuth(context)
  session.set('auth', { userId, version })
  await recordLogin(context.db, userId)
}

export default createController(routes.auth, {
  actions: {
    loginForm(context) {
      if (context.auth.ok) return redirect(routes.home.href())
      let returnTo = safeReturnTo(context.url.searchParams.get('returnTo'))
      return context.render(<LoginPage returnTo={returnTo} />)
    },

    async login(context) {
      let returnTo = safeReturnTo(context.url.searchParams.get('returnTo'))
      let email = String(context.formData.get('email') ?? '')
      let result = await verifyLogin(
        context.db,
        email,
        String(context.formData.get('password') ?? ''),
      )
      if (!result.ok && result.reason === 'unverified') {
        let sent = await sendActivation(context.db, result.identity)
        return context.render(
          <LoginPage
            returnTo={returnTo}
            email={email}
            error={
              sent
                ? `Activate your account first: we’ve sent a link to ${result.identity.email}.`
                : 'Activate your account first. We couldn’t send the link just now; try again in a minute.'
            }
          />,
          { status: 403 },
        )
      }
      if (!result.ok && result.reason === 'disabled') {
        return context.render(
          <LoginPage
            returnTo={returnTo}
            email={email}
            error="This account has been disabled. Ask an admin if you think that’s a mistake."
          />,
          { status: 403 },
        )
      }
      if (!result.ok) {
        return context.render(
          <LoginPage
            returnTo={returnTo}
            email={email}
            error="That email and password don’t match."
          />,
          { status: 401 },
        )
      }
      await logIn(context, result.identity.id, result.sessionVersion)
      return redirect(returnTo, 303)
    },

    signupForm(context) {
      if (context.auth.ok) return redirect(routes.home.href())
      let returnTo = safeReturnTo(context.url.searchParams.get('returnTo'))
      return context.render(<SignupPage returnTo={returnTo} />)
    },

    async signup(context) {
      let returnTo = safeReturnTo(context.url.searchParams.get('returnTo'))
      let values = {
        name: String(context.formData.get('name') ?? ''),
        email: String(context.formData.get('email') ?? ''),
      }
      let result = s.parseSafe(signupForm, context.formData)
      if (!result.success) {
        let errors: FieldErrors = {}
        for (let issue of result.issues) {
          let field = issueField(issue)
          errors[field] ??= MESSAGES[field] ?? issue.message
        }
        return context.render(<SignupPage returnTo={returnTo} values={values} errors={errors} />, {
          status: 400,
        })
      }
      if (!emailDomainAllowed(result.value.email)) {
        return context.render(
          <SignupPage
            returnTo={returnTo}
            values={values}
            errors={{ email: `Use your work email address (${allowedDomainsText()}).` }}
          />,
          { status: 400 },
        )
      }
      if (await findUserByEmail(context.db, result.value.email)) {
        return context.render(
          <SignupPage
            returnTo={returnTo}
            values={values}
            errors={{ email: 'There’s already an account with that email. Try logging in.' }}
          />,
          { status: 409 },
        )
      }
      let user = await createUser(context.db, result.value)
      let sent = await sendActivation(context.db, user)
      return showCheckEmail(context.session, { kind: 'verify', email: user.email, failed: !sent })
    },

    logout(context) {
      context.session.destroy()
      return redirect(routes.home.href(), 303)
    },

    checkEmail(context) {
      let info = context.session.get('checkEmail') as CheckEmailInfo | undefined
      return context.render(<CheckEmailPage info={info ?? null} />)
    },

    async resendVerification(context) {
      let email = String(context.formData.get('email') ?? '').trim()
      let user = email ? await findUserByEmail(context.db, email) : null
      let sent = true
      // Same answer whether or not the account exists or is already active.
      if (user && user.verified_at === null && user.disabled_at === null) {
        sent = await sendActivation(context.db, user)
      }
      return showCheckEmail(context.session, { kind: 'verify', email, failed: !sent })
    },

    async verifyForm(context) {
      let userId = await checkToken(context.db, context.params.token, 'verify')
      let user = userId ? await getUser(context.db, userId) : null
      if (!user)
        return context.render(<LinkExpiredPage kind="verify" />, { status: 410, ...TOKEN_PAGE })
      return context.render(
        <VerifyPage token={context.params.token} name={user.name} />,
        TOKEN_PAGE,
      )
    },

    async verify(context) {
      let userId = await useToken(context.db, context.params.token, 'verify')
      if (!userId)
        return context.render(<LinkExpiredPage kind="verify" />, { status: 410, ...TOKEN_PAGE })
      let version = await markVerified(context.db, userId)
      await logIn(context, userId, version)
      return redirect(routes.home.href(), 303)
    },

    forgotForm(context) {
      return context.render(<ForgotPage />)
    },

    async forgot(context) {
      let email = String(context.formData.get('email') ?? '').trim()
      let user = email ? await findUserByEmail(context.db, email) : null
      let sent = true
      // Same answer whether or not there's an account, so this can't be used
      // to find out who has one.
      if (user && user.disabled_at === null) sent = await sendReset(context.db, user)
      return showCheckEmail(context.session, { kind: 'reset', email, failed: !sent })
    },

    async resetForm(context) {
      let userId = await checkToken(context.db, context.params.token, 'reset')
      if (!userId)
        return context.render(<LinkExpiredPage kind="reset" />, { status: 410, ...TOKEN_PAGE })
      return context.render(<ResetPage token={context.params.token} />, TOKEN_PAGE)
    },

    async reset(context) {
      let { token } = context.params
      let parsed = s.parseSafe(password, String(context.formData.get('password') ?? ''))
      if (!parsed.success) {
        if (!(await checkToken(context.db, token, 'reset'))) {
          return context.render(<LinkExpiredPage kind="reset" />, { status: 410, ...TOKEN_PAGE })
        }
        return context.render(<ResetPage token={token} error={MESSAGES.password} />, {
          status: 400,
          ...TOKEN_PAGE,
        })
      }
      let userId = await useToken(context.db, token, 'reset')
      if (!userId)
        return context.render(<LinkExpiredPage kind="reset" />, { status: 410, ...TOKEN_PAGE })
      let version = await resetPassword(context.db, userId, parsed.value)
      await logIn(context, userId, version)
      return redirect(routes.home.href(), 303)
    },
  },
})
