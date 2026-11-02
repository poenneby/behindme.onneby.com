import type { Handle, RemixNode } from 'remix/component'

export function Field(
  handle: Handle<{
    label: string
    name: string
    error?: string
    hint?: RemixNode
    children: RemixNode
  }>,
) {
  return () => {
    let { label, name, error, hint, children } = handle.props
    return (
      <div class="field">
        <label for={name}>{label}</label>
        {children}
        {hint ? <span class="hint">{hint}</span> : null}
        {error ? (
          <span class="error" id={`${name}-error`}>
            {error}
          </span>
        ) : null}
      </div>
    )
  }
}

export type FieldErrors = Partial<Record<string, string>>
