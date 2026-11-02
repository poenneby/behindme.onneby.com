import type { Handle } from 'remix/component'

import type { Identity } from '../data/users.ts'
import { routes } from '../routes.ts'
import { Document } from './document.tsx'

export function TeamsHelpPage(handle: Handle<{ user: Identity | null }>) {
  return () => (
    <Document
      user={handle.props.user}
      title="Adding backgrounds to Teams"
      section="teams"
      share={{
        path: routes.teamsHelp.href(),
        description:
          'Three ways to add an office background to Microsoft Teams, from one command to org-wide.',
      }}
    >
      <article class="prose">
        <div class="hero">
          <h1>Adding a background to Teams</h1>
          <p>
            Teams has no link or API that adds a background for you, so there are three ways in.
            Pick whichever suits you.
          </p>
        </div>

        <h2>1. One command (fastest)</h2>
        <p>
          Every background has an <strong>Add to Teams</strong> box with a one-line command. On
          Windows, paste it into PowerShell. On a Mac, paste it into Terminal. It downloads the
          1920×1080 image and the small preview Teams expects into Teams’ own background folder for
          your user account. It doesn’t need admin rights and doesn’t touch anything else. Office
          pages have the same box to add every photo from that office at once.
        </p>
        <p>
          Running a command you copied from a website should make you pause, so each box has a{' '}
          <em>Read the script first</em> link. The script only contains this site’s address and the
          image ids. Running it again replaces the files rather than adding duplicates.
        </p>
        <p>
          Animated backgrounds are GIFs. The command installs them with a <code>.png</code>{' '}
          extension, which is how Teams plays an animated background. To make your own, see{' '}
          <a href={routes.animatedHelp.href()}>making an animated background</a>. Works with the new
          Teams app (2023 onwards) and with classic Teams. If the background doesn’t show up
          straight away, quit and reopen Teams. On a Mac, macOS may ask whether Terminal can access
          data from other apps. Allow it, because the folder belongs to Teams.
        </p>

        <h2>2. Download and add it yourself</h2>
        <ol>
          <li>
            Click <strong>Download</strong> on a background. You get a 1920×1080 JPEG, or the GIF
            itself for an animated one. Rename a GIF so it ends in <code>.png</code>, or Teams won’t
            accept it.
          </li>
          <li>
            In Teams, open <strong>Settings → Devices → Video effects</strong> (or{' '}
            <strong>More → Video effects</strong> in a meeting).
          </li>
          <li>
            Choose <strong>Add new</strong> and pick the file you downloaded.
          </li>
        </ol>
        <p>This also works in Teams on the web, which the command can’t reach.</p>

        <h2>3. For the whole organisation</h2>
        <p>
          With a Teams Premium licence, an admin can upload backgrounds in the Teams admin centre (
          <em>Meetings → Customization policies</em>) so they appear for everyone automatically. The
          downloads here are already the right size for that.
        </p>

        <h2>Why not a single click?</h2>
        <p>
          A web page isn’t allowed to write into another app’s folders. Teams doesn’t offer a deep
          link (<code>msteams:</code>) or a Microsoft Graph endpoint for personal backgrounds. A
          true one-click button would need a small helper app installed on each computer to register
          its own link type. The command above does the same job without installing anything.
        </p>
      </article>
    </Document>
  )
}
