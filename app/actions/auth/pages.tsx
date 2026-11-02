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
