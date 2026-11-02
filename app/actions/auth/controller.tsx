import { completeAuth } from 'remix/auth'
import * as s from 'remix/data-schema'
import * as checks from 'remix/data-schema/checks'
import * as f from 'remix/data-schema/form-data'
import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'
import { Session } from 'remix/session'

import { createUser, findUserByEmail, verifyLogin } from '../../data/users.ts'
import { safeReturnTo } from '../../middleware/auth.ts'
import { routes } from '../../routes.ts'
import type { FieldErrors } from '../../ui/field.tsx'
import { LoginPage, SignupPage } from './pages.tsx'

const trimmed = s.string().transform((value) => value.trim())

const signupForm = f.object({
  name: f.field(trimmed.pipe(checks.minLength(1), checks.maxLength(60))),
  email: f.field(trimmed.pipe(checks.email())),
  password: f.field(s.string().pipe(checks.minLength(10), checks.maxLength(200))),
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

export default createController(routes.auth, {
  actions: {
    loginForm(context) {
      if (context.auth.ok) return redirect(routes.home.href())
      let returnTo = safeReturnTo(context.url.searchParams.get('returnTo'))
      let notice = context.session.get('notice')
      return context.render(
        <LoginPage returnTo={returnTo} notice={typeof notice === 'string' ? notice : undefined} />,
      )
    },

    async login(context) {
      let returnTo = safeReturnTo(context.url.searchParams.get('returnTo'))
      let email = String(context.formData.get('email') ?? '')
      let password = String(context.formData.get('password') ?? '')
      let user = await verifyLogin(context.db, email, password)
      if (!user) {
        return context.render(
          <LoginPage
            returnTo={returnTo}
            email={email}
            error="That email and password don’t match."
          />,
          { status: 401 },
        )
      }
      let session = completeAuth(context)
      session.set('auth', { userId: user.id })
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
      let session = completeAuth(context)
      session.set('auth', { userId: user.id })
      return redirect(returnTo, 303)
    },

    logout(context) {
      let session = context.get(Session)
      session.destroy()
      return redirect(routes.home.href(), 303)
    },
  },
})
