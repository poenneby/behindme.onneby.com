# Behind Me

Teams backgrounds from our offices. Colleagues share photos of the places we
work, rate each other's, and add any of them to Microsoft Teams with one
pasted command. Live at https://behindme.onneby.com.

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
The folder paths are undocumented by Microsoft and could move in a Teams
update. `/teams` in the app explains the alternatives to users.

## Layout

- `app/routes.ts`: every URL the app serves
- `app/router.ts`: middleware (logging, cross-origin protection, sessions, auth, uploads, rendering)
- `app/actions/`: controllers and pages, one folder per route group (`auth`, `backgrounds`, `locations`)
- `app/data/`: tables, queries, password hashing
- `app/images.ts`: upload processing with sharp (1920×1080 JPEG, Teams thumbnail, WebP preview, metadata stripped)
- `app/teams.ts`: the Windows/macOS install scripts
- `app/ui/public/add-to-teams.tsx`: the only component that hydrates in the browser
- `db/migrations/`: SQL migrations, applied on startup. Add a new numbered folder, never edit an applied one

## Licence

[MIT](LICENSE)
