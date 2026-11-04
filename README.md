# Behind Me

Teams backgrounds, shared by colleagues. People share photos and animated
GIFs by category, rate each other's, and add any of them to Microsoft Teams
with one pasted command. Live at https://behindme.onneby.com.

Built with [Remix 3](https://remix.run): one `remix` dependency (plus `sharp`
for images), server-rendered components, one hydrated component, SQLite
through `remix/data-table`, and no build step. Node runs the TypeScript
source directly.

![A background page: the photo, its rating, a download button and the one-line "Add to Teams" command](docs/screenshot.jpg)

## Developing

Needs Node ≥ 24.3.

```sh
npm i
npm run dev        # http://localhost:44100, data in ./data
npm test           # integration tests through router.fetch()
npm run typecheck
```

## Environment

| Variable | Default (dev) | Notes |
|----------|---------------|-------|
| `SESSION_SECRET` | dev-only value | Required in production |
| `PUBLIC_ORIGIN` | `http://localhost:44100` | Required in production. Used in install scripts |
| `SMTP_URL` | none: emails are printed to the console | Required in production. Sends activation and password-reset emails, e.g. `smtps://user:password@smtp.example.com:465` |
| `MAIL_FROM` | `Behind Me <noreply@localhost>` | Required in production. The sender, e.g. `Behind Me <noreply@onneby.com>` |
| `ALLOWED_EMAIL_DOMAINS` | none: any domain | Comma-separated domains people may sign up with, e.g. your company's. Existing accounts on other domains keep working and are flagged on the users page |
| `ADMIN_EMAILS` | none | Comma-separated emails of built-in admins. They can manage users at `/admin/users`, and can't be demoted or disabled from the website |
| `DATA_DIR` | `./data` | SQLite database, images, sessions |
| `PORT` | `44100` | |

## How "Add to Teams" works

Teams has no deep link or Graph API for personal backgrounds. Its "Add new"
button just copies `<guid>.jpg` and a `<guid>_thumb.jpg` (280 px wide) into a
per-user Uploads folder. `app/teams.ts` serves PowerShell and sh scripts that
do the same:

```
irm https://behindme.onneby.com/b/<id>/teams.ps1 | iex      # Windows
curl -fsSL https://behindme.onneby.com/b/<id>/teams.sh | sh  # macOS
```

People pipe these straight into a shell, so the scripts contain only
server-generated values: GUIDs, ids, and `PUBLIC_ORIGIN`. They never contain
user text or the request's `Host` header, and a test checks this. Each
background has a fixed GUID, so running a script twice overwrites the files.

Animated backgrounds are GIFs, kept at 1280×720. Teams plays a GIF renamed to
`.png`, so the scripts install them as `<guid>.png` with a still
`<guid>_thumb.png`.

GIFs are stored and installed exactly as uploaded: making a small,
good-looking GIF is up to the person sharing it. The `/animated` page explains
how, with free tools (ezgif, Gifski, ffmpeg). Only the first frame is decoded,
for the thumbnail and gallery preview.
The folder paths are undocumented by Microsoft and could move in a Teams
update. `/teams` in the app explains the alternatives to users.

## Layout

- `app/routes.ts`: every URL the app serves
- `app/router.ts`: middleware (logging, cross-origin protection, sessions, auth, uploads, rendering)
- `app/middleware/no-index.ts`: keeps the site out of search engines (`X-Robots-Tag` on every response). `robots.txt` allows crawling on purpose, so crawlers can see it
- `app/actions/document.tsx`: the page shell, including Open Graph tags so shared links unfurl with the photo
- `app/actions/`: controllers and pages, one folder per route group (`admin`, `auth`, `backgrounds`, `categories`)
- `app/data/`: tables, queries, password hashing
- `app/images.ts`: upload processing with sharp (1920×1080 JPEG, Teams thumbnail, WebP preview, metadata stripped)
- `app/teams.ts`: the Windows/macOS install scripts
- `app/ui/public/add-to-teams.tsx`: the only component that hydrates in the browser
- `db/migrations/`: SQL migrations, applied on startup. Add a new numbered folder, never edit an applied one

## Licence

[MIT](LICENSE)
