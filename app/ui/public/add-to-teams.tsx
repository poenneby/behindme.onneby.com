import { clientEntry, on, type Handle } from 'remix/component'

type Os = 'windows' | 'mac'

export interface AddToTeamsProps {
  windowsCommand: string
  macCommand: string
  windowsScriptHref: string
  macScriptHref: string
  /** Count shown in the heading, e.g. for "Add all 12" on an office page. */
  count?: number
}

/**
 * The one-line "Add to Teams" commands. Server-rendered with both commands
 * visible; once hydrated it picks the visitor's OS and adds a copy button.
 */
export const AddToTeams = clientEntry(
  import.meta.url,
  function AddToTeams(handle: Handle<AddToTeamsProps>) {
    let os: Os = 'windows'
    let hydrated = false
    let copied = false

    handle.queueTask(() => {
      if (typeof window === 'undefined') return
      hydrated = true
      if (/Mac/i.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent)) os = 'mac'
      handle.update()
    })

    return () => {
      let { windowsCommand, macCommand, windowsScriptHref, macScriptHref, count } = handle.props
      let command = os === 'windows' ? windowsCommand : macCommand
      let scriptHref = os === 'windows' ? windowsScriptHref : macScriptHref
      let shell = os === 'windows' ? 'PowerShell' : 'Terminal'
      let label = count && count > 1 ? `Add all ${count} to Teams` : 'Add to Teams'

      return (
        <section class="teams" aria-label={label}>
          <div class="row" style={{ justifyContent: 'space-between' }}>
            <h2>{label}</h2>
            <div class="os-tabs" role="group" aria-label="Your computer">
              {(['windows', 'mac'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={os === value ? 'true' : 'false'}
                  mix={on('click', () => {
                    os = value
                    copied = false
                    handle.update()
                  })}
                >
                  {value === 'windows' ? 'Windows' : 'Mac'}
                </button>
              ))}
            </div>
          </div>
          <p class="small muted" style={{ margin: 0 }}>
            Paste into {shell} (not as admin). It copies the image straight into Teams’ background
            folder, then it shows up under <em>Backgrounds</em>.
          </p>
          <div class="command">
            <code>{command}</code>
            {hydrated ? (
              <button
                type="button"
                class="btn"
                mix={on('click', async (_event, signal) => {
                  try {
                    await navigator.clipboard.writeText(command)
                    copied = true
                  } catch {
                    copied = false
                  }
                  handle.update()
                  await new Promise((resolve) => setTimeout(resolve, 1500))
                  if (signal.aborted) return
                  copied = false
                  handle.update()
                })}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            ) : null}
          </div>
          <p class="small muted" style={{ margin: 0 }}>
            <a href={scriptHref} target="_blank" rel="noopener">
              Read the script first
            </a>{' '}
            · <a href="/teams">Other ways to add it</a>
          </p>
        </section>
      )
    }
  },
)
