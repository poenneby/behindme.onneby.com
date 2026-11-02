import type { Handle } from 'remix/component'

import { routes } from '../../routes.ts'
import { Field, type FieldErrors } from '../../ui/field.tsx'
import { Document } from '../document.tsx'

export function LoginPage(
  handle: Handle<{ returnTo: string; email?: string; error?: string; notice?: string }>,
) {
  return () => {
    let { returnTo, email, error, notice } = handle.props
    return (
      <Document title="Log in">
        <form
          class="form form-narrow"
          method="post"
          action={routes.auth.login.href(null, { searchParams: { returnTo } })}
        >
          <h1>Log in</h1>
          {notice ? <p class="notice">{notice}</p> : null}
          {error ? (
            <p class="alert" role="alert">
              {error}
            </p>
          ) : null}
          <Field label="Email" name="email">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={email}
            />
          </Field>
          <Field label="Password" name="password">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <button class="btn btn-primary" type="submit">
            Log in
          </button>
          <p class="small muted" style={{ margin: 0 }}>
            <a href={routes.auth.forgotForm.href()}>Forgot your password?</a>
          </p>
          <p class="small muted">
            New here?{' '}
            <a href={routes.auth.signupForm.href(null, { searchParams: { returnTo } })}>
              Create an account
            </a>
          </p>
        </form>
      </Document>
    )
  }
}

export function SignupPage(
  handle: Handle<{
    returnTo: string
    values?: { email?: string; name?: string }
    errors?: FieldErrors
  }>,
) {
  return () => {
    let { returnTo, values = {}, errors = {} } = handle.props
    return (
      <Document title="Create an account">
        <form
          class="form form-narrow"
          method="post"
          action={routes.auth.signup.href(null, { searchParams: { returnTo } })}
        >
          <h1>Create an account</h1>
          <p class="muted" style={{ margin: 0 }}>
            You need an account to share and rate backgrounds. Browsing and downloading are open to
            everyone.
          </p>
          {errors.form ? (
            <p class="alert" role="alert">
              {errors.form}
            </p>
          ) : null}
          <Field
            label="Name"
            name="name"
            error={errors.name}
            hint="Shown on the backgrounds you share."
          >
            <input
              id="name"
              name="name"
              autoComplete="name"
              required
              maxLength={60}
              defaultValue={values.name}
            />
          </Field>
          <Field label="Email" name="email" error={errors.email}>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={values.email}
            />
          </Field>
          <Field
            label="Password"
            name="password"
            error={errors.password}
            hint="At least 10 characters."
          >
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
            />
          </Field>
          <button class="btn btn-primary" type="submit">
            Create account
          </button>
          <p class="small muted">
            Already have one?{' '}
            <a href={routes.auth.loginForm.href(null, { searchParams: { returnTo } })}>Log in</a>
          </p>
        </form>
      </Document>
    )
  }
}

export type CheckEmailKind = 'verify' | 'reset'

export interface CheckEmailInfo {
  kind: CheckEmailKind
  email: string
  /** The SMTP server refused the email. */
  failed?: boolean
}

/** Shown after anything that sends an email. */
export function CheckEmailPage(handle: Handle<{ info: CheckEmailInfo | null }>) {
  return () => {
    let { info } = handle.props
    let resetting = info?.kind === 'reset'
    return (
      <Document title="Check your email">
        <div class="form form-narrow">
          <h1>Check your email</h1>
          {info?.failed ? (
            <p class="alert" role="alert">
              We couldn’t send the email just now. Wait a minute and try again.
            </p>
          ) : resetting ? (
            <p>
              If there’s an account for <strong>{info?.email}</strong>, we’ve sent it a link to
              choose a new password. The link works for 1 hour.
            </p>
          ) : info ? (
            <p>
              We’ve sent a link to <strong>{info.email}</strong>. Click it to activate your account.
              The link works for 24 hours.
            </p>
          ) : (
            <p>We’ve sent you an email with a link. Click it to carry on.</p>
          )}
          <p class="small muted">
            Nothing after a few minutes? Check your spam or junk folder.{' '}
            {resetting ? (
              <a href={routes.auth.forgotForm.href()}>Send another link</a>
            ) : (
              <ResendActivation email={info?.email} />
            )}
          </p>
        </div>
      </Document>
    )
  }
}

function ResendActivation(handle: Handle<{ email?: string }>) {
  return () => (
    <form
      method="post"
      action={routes.auth.resendVerification.href()}
      style={{ display: 'inline' }}
    >
      <input type="hidden" name="email" value={handle.props.email ?? ''} />
      {handle.props.email ? (
        <button class="link-button" type="submit">
          Send another link
        </button>
      ) : null}
    </form>
  )
}

/** The page an activation link opens. Pressing the button uses the link. */
export function VerifyPage(handle: Handle<{ token: string; name: string }>) {
  return () => (
    <Document title="Activate your account">
      <form
        class="form form-narrow"
        method="post"
        action={routes.auth.verify.href({ token: handle.props.token })}
      >
        <h1>Activate your account</h1>
        <p>Welcome, {handle.props.name}. One click and you’re in.</p>
        <button class="btn btn-primary" type="submit">
          Activate my account
        </button>
      </form>
    </Document>
  )
}

/** A link that has expired, was already used, or never existed. */
export function LinkExpiredPage(handle: Handle<{ kind: CheckEmailKind }>) {
  return () => {
    let resetting = handle.props.kind === 'reset'
    return (
      <Document title="Link expired">
        <div class="form form-narrow">
          <h1>That link has expired</h1>
          <p>Links work once, for {resetting ? '1 hour' : '24 hours'}. Get a new one below.</p>
          {resetting ? (
            <a class="btn btn-primary" href={routes.auth.forgotForm.href()}>
              Send a new link
            </a>
          ) : (
            <form method="post" action={routes.auth.resendVerification.href()} class="form">
              <Field label="Email" name="email">
                <input id="email" name="email" type="email" autoComplete="email" required />
              </Field>
              <button class="btn btn-primary" type="submit">
                Send a new activation link
              </button>
            </form>
          )}
          <p class="small muted">
            Already activated? <a href={routes.auth.loginForm.href()}>Log in</a>
          </p>
        </div>
      </Document>
    )
  }
}

export function ForgotPage(handle: Handle<{ email?: string }>) {
  return () => (
    <Document title="Forgot your password">
      <form class="form form-narrow" method="post" action={routes.auth.forgot.href()}>
        <h1>Forgot your password?</h1>
        <p class="muted" style={{ margin: 0 }}>
          Enter your email and we’ll send you a link to choose a new one.
        </p>
        <Field label="Email" name="email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={handle.props.email}
          />
        </Field>
        <button class="btn btn-primary" type="submit">
          Send me a link
        </button>
        <p class="small muted">
          Remembered it? <a href={routes.auth.loginForm.href()}>Log in</a>
        </p>
      </form>
    </Document>
  )
}

export function ResetPage(handle: Handle<{ token: string; error?: string }>) {
  return () => (
    <Document title="Choose a new password">
      <form
        class="form form-narrow"
        method="post"
        action={routes.auth.reset.href({ token: handle.props.token })}
      >
        <h1>Choose a new password</h1>
        <Field
          label="New password"
          name="password"
          error={handle.props.error}
          hint="At least 10 characters. You’ll be logged out everywhere else."
        >
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
          />
        </Field>
        <button class="btn btn-primary" type="submit">
          Save and log in
        </button>
      </form>
    </Document>
  )
}
