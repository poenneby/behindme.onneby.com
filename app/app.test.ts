import sharp from 'sharp'
import * as assert from 'remix/assert'
import { beforeAll, describe, it } from 'remix/test'

import { sql } from 'remix/data-table'

import { db, migrateDatabase } from './db.ts'
import { createUser, markVerified } from './data/users.ts'
import { outbox } from './mail.ts'
import { ROBOTS } from './middleware/no-index.ts'
import { router } from './router.ts'

const ORIGIN = 'http://localhost'

/** A tiny cookie jar so a test can act as a signed-in browser. */
function browser() {
  let cookie = ''
  return async function request(path: string, init: RequestInit = {}) {
    let headers = new Headers(init.headers)
    if (cookie) headers.set('Cookie', cookie)
    let response = await router.fetch(new Request(new URL(path, ORIGIN), { ...init, headers }))
    let setCookie = response.headers.get('Set-Cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    return response
  }
}

function form(values: Record<string, string | File>) {
  let body = new FormData()
  for (let [key, value] of Object.entries(values)) body.set(key, value)
  return { method: 'POST', body }
}

async function photo(width: number, height: number) {
  let bytes = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 60 } },
  })
    .jpeg()
    .toBuffer()
  return new File([new Uint8Array(bytes)], 'office.jpg', { type: 'image/jpeg' })
}

/** A GIF of solid-colour frames, each shown for `delay` ms. */
async function animatedGif(width: number, height: number, frames: number, delay = 100) {
  let frameBytes = width * height * 3
  let raw = Buffer.alloc(frameBytes * frames)
  for (let i = 0; i < frames; i++) {
    // Clearly different colours, so the encoder doesn't merge frames that
    // barely changed.
    raw.fill(
      Buffer.from([(80 * i) % 256, (200 - 50 * i + 256) % 256, (40 + 120 * i) % 256]),
      i * frameBytes,
      (i + 1) * frameBytes,
    )
  }
  let image =
    frames === 1
      ? sharp(raw, { raw: { width, height, channels: 3 } }).gif()
      : sharp(raw, {
          raw: { width, height: height * frames, channels: 3, pageHeight: height },
        }).gif({
          delay: Array(frames).fill(delay),
          loop: 0,
          effort: 1,
        })
  let bytes = await image.toBuffer()
  return new File([new Uint8Array(bytes)], 'loop.gif', { type: 'image/gif' })
}

async function gifMeta(response: Response) {
  return sharp(new Uint8Array(await response.arrayBuffer()), { animated: true }).metadata()
}

/** The path of the newest emailed link of this kind sent to `email`. */
function emailedLink(email: string, kind: 'verify' | 'reset') {
  let mail = outbox.findLast((m) => m.to === email)
  assert.ok(mail, `no email sent to ${email}`)
  let match = mail.text.match(new RegExp(`https?://[^/]+(/${kind}/[A-Za-z0-9_-]{43})`))
  assert.ok(match, `no ${kind} link in "${mail.subject}"`)
  return match[1]
}

/** Signs up and activates the account from the emailed link, logging in. */
async function signUp(request: ReturnType<typeof browser>, email: string) {
  let response = await request(
    '/signup',
    form({ name: email.split('@')[0], email, password: 'a long enough password' }),
  )
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('Location'), '/check-email')
  let activated = await request(emailedLink(email, 'verify'), { method: 'POST' })
  assert.equal(activated.status, 303)
}

async function userId(email: string) {
  let result = await db.exec(sql`select id from users where email = ${email}`)
  let id = result.rows?.[0]?.id
  assert.ok(id, `no account for ${email}`)
  return String(id)
}

describe('office backdrops', () => {
  beforeAll(async () => {
    await migrateDatabase()
  })

  it('serves the home page to anonymous visitors', async () => {
    let response = await browser()('/')
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Teams backgrounds from our offices/)
  })

  it('sends anonymous uploaders to log in first', async () => {
    let response = await browser()('/upload')
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('Location'), '/login?returnTo=%2Fupload')
  })

  it('rejects photos that are too small', async () => {
    let request = browser()
    await signUp(request, 'small@example.com')
    let response = await request(
      '/upload',
      form({ photo: await photo(800, 600), title: 'Tiny', location: 'Paris' }),
    )
    assert.equal(response.status, 400)
    assert.match(await response.text(), /at least 1280×720/)
  })

  it('uploads, rates and installs a background', async () => {
    let owner = browser()
    await signUp(owner, 'owner@example.com')
    let upload = await owner(
      '/upload',
      form({
        photo: await photo(3000, 2000),
        title: "Rooftop'; Remove-Item C:\\ -Recurse #",
        location: 'Paris – Opéra',
      }),
    )
    assert.equal(upload.status, 303)
    let showPath = upload.headers.get('Location')!
    let id = showPath.split('/').pop()!

    // Shared links unfurl with the photo itself, as an absolute URL.
    let page = await (await owner(showPath)).text()
    // The download link must bypass client-side navigation, or the browser
    // renders the JPEG's bytes as a page instead of saving it.
    assert.match(page, new RegExp(`<a [^>]*href="${showPath}/download"[^>]*\\bdownload\\b`))
    assert.match(page, /href="[^"]*teams\.ps1"[^>]*data-rmx-document/)
    assert.match(
      page,
      new RegExp(`<meta property="og:image" content="http://localhost:44100/images/${id}\\.jpg"`),
    )
    assert.match(page, /<meta property="og:title" content="Rooftop/)
    assert.match(page, /<meta name="twitter:card" content="summary_large_image"/)

    let image = await owner(`/images/${id}.jpg`)
    assert.equal(image.headers.get('X-Robots-Tag'), ROBOTS)
    // Short-lived, so deleting a background takes effect at the CDN too.
    assert.equal(image.headers.get('Cache-Control'), 'public, max-age=3600')
    assert.equal(image.status, 200)
    let meta = await sharp(new Uint8Array(await image.arrayBuffer())).metadata()
    assert.equal(meta.width, 1920)
    assert.equal(meta.height, 1080)

    let thumb = await sharp(
      new Uint8Array(await (await owner(`/images/${id}_thumb.jpg`)).arrayBuffer()),
    ).metadata()
    assert.equal(thumb.width, 280)

    // The owner can't rate their own photo; someone else can.
    assert.equal((await owner(`${showPath}/rate`, form({ stars: '5' }))).status, 403)
    let rater = browser()
    await signUp(rater, 'rater@example.com')
    assert.equal((await rater(`${showPath}/rate`, form({ stars: '4' }))).status, 303)
    assert.match(await (await rater(showPath)).text(), /Rated 4\.0 out of 5 by 1/)

    // Install scripts carry the image URLs but never user-supplied text.
    for (let script of [`${showPath}/teams.ps1`, `/locations/paris-opera/teams.sh`]) {
      let body = await (await browser()(script)).text()
      assert.match(body, new RegExp(`/images/${id}\\.jpg`))
      assert.match(body, /_thumb\.jpg/)
      assert.ok(!body.includes('Remove-Item'), `${script} must not contain the title`)
    }

    // Only the owner can delete.
    assert.equal((await rater(`${showPath}/delete`, { method: 'POST' })).status, 403)
    assert.equal((await owner(`${showPath}/delete`, { method: 'POST' })).status, 303)
    assert.equal((await owner(showPath)).status, 404)
    assert.equal((await owner(`/images/${id}.jpg`)).status, 404)
  })

  it('stores animated GIFs exactly as uploaded and installs them as .png', async () => {
    let request = browser()
    await signUp(request, 'gif@example.com')
    let original = await animatedGif(800, 600, 4)
    let upload = await request(
      '/upload',
      form({ photo: original, title: 'Lift doors', location: 'Lyon' }),
    )
    assert.equal(upload.status, 303)
    let showPath = upload.headers.get('Location')!
    let id = showPath.split('/').pop()!

    let gif = await request(`/images/${id}.gif`)
    assert.equal(gif.status, 200)
    // Byte for byte what was uploaded: no resizing or re-encoding.
    assert.deepEqual(
      new Uint8Array(await gif.arrayBuffer()),
      new Uint8Array(await original.arrayBuffer()),
    )

    let thumb = await sharp(
      new Uint8Array(await (await request(`/images/${id}_thumb.png`)).arrayBuffer()),
    ).metadata()
    assert.equal(thumb.format, 'png')
    assert.equal(thumb.width, 280)

    // The gallery preview is a still of the first frame.
    let preview = await gifMeta(await request(`/images/${id}.webp`))
    assert.equal(preview.format, 'webp')
    assert.equal(preview.pages ?? 1, 1)

    assert.match(await (await request(showPath)).text(), /Animated/)

    let ps1 = await (await request(`${showPath}/teams.ps1`)).text()
    assert.match(ps1, new RegExp(`Ext = 'png'; Image = '[^']*/images/${id}\\.gif'`))
    let sh = await (await request(`${showPath}/teams.sh`)).text()
    assert.match(sh, new RegExp(`/images/${id}\\.gif' -o "\\$dir/[0-9a-f-]{36}\\.png"`))
    assert.match(sh, /_thumb\.png"/)

    let download = await request(`${showPath}/download`)
    assert.match(download.headers.get('Content-Disposition') ?? '', /lyon-lift-doors\.gif/)
  })

  it('rejects animated GIFs that are too small', async () => {
    let request = browser()
    await signUp(request, 'tiny@example.com')
    let response = await request(
      '/upload',
      form({ photo: await animatedGif(320, 240, 3), title: 'Tiny', location: 'Lyon' }),
    )
    assert.equal(response.status, 400)
    assert.match(await response.text(), /need at least 640×360/)
  })

  it('treats a single-frame GIF as a photo', async () => {
    let request = browser()
    await signUp(request, 'still@example.com')
    let upload = await request(
      '/upload',
      form({ photo: await animatedGif(1600, 900, 1), title: 'Still', location: 'Lyon' }),
    )
    assert.equal(upload.status, 303)
    let id = upload.headers.get('Location')!.split('/').pop()!
    assert.equal((await request(`/images/${id}.jpg`)).status, 200)
    assert.equal((await request(`/images/${id}.gif`)).status, 404)
  })

  it('needs the emailed link before an account can log in', async () => {
    let request = browser()
    let email = 'new@example.com'
    let signup = await request(
      '/signup',
      form({ name: 'New', email, password: 'a long enough password' }),
    )
    assert.equal(signup.headers.get('Location'), '/check-email')
    assert.match(await (await request('/check-email')).text(), /new@example\.com/)
    assert.equal(outbox.findLast((m) => m.to === email)?.subject, 'Activate your Behind Me account')

    // Not activated yet: logging in is refused, and signing up didn't log in.
    assert.equal((await request('/upload')).status, 302)
    let login = await request('/login', form({ email, password: 'a long enough password' }))
    assert.equal(login.status, 403)
    assert.match(await login.text(), /Activate your account first/)

    // Opening the link (as a mail scanner would) doesn't use it up…
    let link = emailedLink(email, 'verify')
    for (let i = 0; i < 2; i++) {
      let page = await browser()(link)
      assert.equal(page.status, 200)
      assert.equal(page.headers.get('Referrer-Policy'), 'no-referrer')
      assert.match(await page.text(), /Activate my account/)
    }
    // …pressing the button does, and logs in.
    assert.equal((await request(link, { method: 'POST' })).status, 303)
    assert.equal((await request('/upload')).status, 200)
    assert.equal((await browser()(link, { method: 'POST' })).status, 410)

    let again = browser()
    let relogin = await again('/login', form({ email, password: 'a long enough password' }))
    assert.equal(relogin.status, 303)
  })

  it('only lets people sign up with an allowed email domain', async () => {
    // The test script sets ALLOWED_EMAIL_DOMAINS=example.com.
    for (let email of ['someone@gmail.com', 'x@example.com.evil.test', 'x@notexample.com']) {
      let sentBefore = outbox.length
      let response = await browser()(
        '/signup',
        form({ name: 'Outsider', email, password: 'a long enough password' }),
      )
      assert.equal(response.status, 400, email)
      assert.match(await response.text(), /Use your work email address \(…@example\.com\)/)
      assert.equal(outbox.length, sentBefore, email)
      let found = await db.exec(sql`select 1 from users where email = ${email}`)
      assert.equal(found.rows?.length, 0, email)
    }
    assert.match(await (await browser()('/signup')).text(), /Your work email \(…@example\.com\)/)

    let mixedCase = await browser()(
      '/signup',
      form({ name: 'Caps', email: 'Caps@Example.COM', password: 'a long enough password' }),
    )
    assert.equal(mixedCase.headers.get('Location'), '/check-email')
  })

  it('rejects expired activation links', async () => {
    let request = browser()
    let email = 'late@example.com'
    await request('/signup', form({ name: 'Late', email, password: 'a long enough password' }))
    let link = emailedLink(email, 'verify')
    await db.exec(sql`update auth_tokens set expires_at = 0`)
    assert.equal((await request(link)).status, 410)
    assert.equal((await request(link, { method: 'POST' })).status, 410)
  })

  it('escapes names in emails', async () => {
    let email = 'html@example.com'
    await browser()(
      '/signup',
      form({ name: '<img src=x>', email, password: 'a long enough password' }),
    )
    let mail = outbox.findLast((m) => m.to === email)!
    assert.ok(!mail.html.includes('<img src=x>'))
    assert.match(mail.html, /&lt;img src=x&gt;/)
  })

  it('resets a forgotten password and logs out other sessions', async () => {
    let email = 'forgetful@example.com'
    let laptop = browser()
    await signUp(laptop, email)
    assert.equal((await laptop('/upload')).status, 200)

    // Unknown addresses get the same answer, and no email.
    let phone = browser()
    let sentBefore = outbox.length
    let unknown = await phone('/forgot', form({ email: 'nobody@example.com' }))
    assert.equal(unknown.status, 303)
    assert.equal(outbox.length, sentBefore)

    let forgot = await phone('/forgot', form({ email }))
    assert.equal(forgot.headers.get('Location'), '/check-email')
    let link = emailedLink(email, 'reset')
    assert.equal(outbox.at(-1)?.subject, 'Reset your Behind Me password')

    assert.equal((await phone(link)).status, 200)
    assert.equal((await phone(link, form({ password: 'short' }))).status, 400)
    let reset = await phone(link, form({ password: 'a brand new password' }))
    assert.equal(reset.status, 303)
    assert.equal((await phone('/upload')).status, 200)

    // The laptop's session ended; the old password no longer works.
    assert.equal((await laptop('/upload')).status, 302)
    let old = await browser()('/login', form({ email, password: 'a long enough password' }))
    assert.equal(old.status, 401)
    let fresh = await browser()('/login', form({ email, password: 'a brand new password' }))
    assert.equal(fresh.status, 303)
    assert.equal((await phone(link, form({ password: 'yet another password' }))).status, 410)
  })

  it('sends at most one email of each kind a minute', async () => {
    let email = 'impatient@example.com'
    await signUp(browser(), email)
    let sentBefore = outbox.length
    await browser()('/forgot', form({ email }))
    await browser()('/forgot', form({ email }))
    assert.equal(outbox.length, sentBefore + 1)
  })

  describe('admin', () => {
    // boss@example.com is in ADMIN_EMAILS (see the test script in package.json).
    let boss: ReturnType<typeof browser>

    beforeAll(async () => {
      boss = browser()
      await signUp(boss, 'boss@example.com')
    })

    it('keeps the users page to admins', async () => {
      let anonymous = await browser()('/admin/users')
      assert.equal(anonymous.status, 302)
      let member = browser()
      await signUp(member, 'member@example.com')
      assert.equal((await member('/admin/users')).status, 403)
      assert.doesNotMatch(await (await member('/')).text(), /href="\/admin\/users"/)

      let page = await boss('/admin/users')
      assert.equal(page.status, 200)
      let html = await page.text()
      assert.match(html, /member@example\.com/)
      assert.match(html, /href="\/admin\/users"/)
    })

    it('promotes and demotes, but never itself or a built-in admin', async () => {
      let helper = browser()
      await signUp(helper, 'helper@example.com')
      let id = await userId('helper@example.com')

      await boss(`/admin/users/${id}/role`, form({ role: 'admin' }))
      assert.equal((await helper('/admin/users')).status, 200)

      // The new admin can't demote the built-in one, or themselves.
      let bossId = await userId('boss@example.com')
      await helper(`/admin/users/${bossId}/role`, form({ role: 'member' }))
      assert.equal((await boss('/admin/users')).status, 200)
      let self = await helper(`/admin/users/${id}/role`, form({ role: 'member' }))
      assert.equal(self.status, 303)
      assert.match(await (await helper('/admin/users')).text(), /can’t change your own account/)

      await boss(`/admin/users/${id}/role`, form({ role: 'member' }))
      assert.equal((await helper('/admin/users')).status, 403)
    })

    it('disables an account at once, and enables it again', async () => {
      let email = 'troublemaker@example.com'
      let member = browser()
      await signUp(member, email)
      let id = await userId(email)

      await boss(`/admin/users/${id}/disable`, { method: 'POST' })
      assert.equal((await member('/upload')).status, 302)
      let login = await browser()('/login', form({ email, password: 'a long enough password' }))
      assert.equal(login.status, 403)
      assert.match(await login.text(), /disabled/)
      let sentBefore = outbox.length
      await browser()('/forgot', form({ email }))
      assert.equal(outbox.length, sentBefore)

      await boss(`/admin/users/${id}/enable`, { method: 'POST' })
      let again = await browser()('/login', form({ email, password: 'a long enough password' }))
      assert.equal(again.status, 303)
    })

    it('activates an account by hand and sends reset links', async () => {
      let email = 'no-email@example.com'
      await browser()(
        '/signup',
        form({ name: 'No Email', email, password: 'a long enough password' }),
      )
      let id = await userId(email)

      await boss(`/admin/users/${id}/activate`, { method: 'POST' })
      let login = await browser()('/login', form({ email, password: 'a long enough password' }))
      assert.equal(login.status, 303)

      await boss(`/admin/users/${id}/reset`, { method: 'POST' })
      assert.equal(outbox.at(-1)?.to, email)
      assert.ok(emailedLink(email, 'reset'))
    })

    it('deletes an account with its backgrounds', async () => {
      let email = 'leaver@example.com'
      let member = browser()
      await signUp(member, email)
      let upload = await member(
        '/upload',
        form({ photo: await photo(1600, 900), title: 'Last day', location: 'Lyon' }),
      )
      let showPath = upload.headers.get('Location')!
      let backgroundId = showPath.split('/').pop()!
      let id = await userId(email)

      let confirm = await boss(`/admin/users/${id}/delete`)
      assert.match(await confirm.text(), /1 background/)
      assert.equal((await boss(`/admin/users/${id}/delete`, { method: 'POST' })).status, 303)

      assert.equal((await boss(showPath)).status, 404)
      assert.equal((await boss(`/images/${backgroundId}.jpg`)).status, 404)
      assert.equal((await member('/upload')).status, 302)
    })

    it('refuses admin actions from members, and cross-site posts from admins', async () => {
      let member = browser()
      await signUp(member, 'sneaky@example.com')
      let id = await userId('sneaky@example.com')
      for (let action of ['role', 'disable', 'enable', 'activate', 'reset', 'delete']) {
        let response = await member(`/admin/users/${id}/${action}`, form({ role: 'admin' }))
        assert.equal(response.status, 403, action)
      }
      assert.equal((await member('/admin/users')).status, 403)

      // A page on another site making an admin's browser post an action.
      let victim = await userId('member@example.com')
      let forged = await boss(`/admin/users/${victim}/delete`, {
        method: 'POST',
        headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' },
      })
      assert.equal(forged.status, 403)
      assert.ok(await userId('member@example.com'))
    })

    it('needs the built-in admin email to be proven before it means anything', async () => {
      // Someone signs up with a built-in admin's address they don't own.
      let impostor = browser()
      let signup = await impostor(
        '/signup',
        form({ name: 'Impostor', email: 'boss2@example.com', password: 'a long enough password' }),
      )
      assert.equal(signup.status, 303)
      // Without the emailed link there's no session at all, let alone admin.
      assert.equal((await impostor('/admin/users')).status, 302)
      let login = await impostor(
        '/login',
        form({ email: 'boss2@example.com', password: 'a long enough password' }),
      )
      assert.equal(login.status, 403)
      assert.equal((await impostor('/admin/users')).status, 302)
    })

    it('keeps existing accounts on other domains working, and flags them', async () => {
      // An account made before the domain rule existed.
      let legacy = await createUser(db, {
        name: 'Legacy',
        email: 'legacy@onneby.test',
        password: 'a long enough password',
      })
      await markVerified(db, legacy.id)
      let login = await browser()(
        '/login',
        form({ email: 'legacy@onneby.test', password: 'a long enough password' }),
      )
      assert.equal(login.status, 303)
      let page = await (await boss('/admin/users?q=legacy')).text()
      assert.match(page, /Other domain/)
      assert.doesNotMatch(await (await boss('/admin/users?q=boss@')).text(), /Other domain/)
    })

    it('lets admins, but not other members, delete any background', async () => {
      let owner = browser()
      await signUp(owner, 'owner2@example.com')
      let upload = await owner(
        '/upload',
        form({ photo: await photo(1600, 900), title: 'Not allowed', location: 'Lyon' }),
      )
      let showPath = upload.headers.get('Location')!
      let other = browser()
      await signUp(other, 'other@example.com')
      assert.equal((await other(`${showPath}/delete`, { method: 'POST' })).status, 403)
      assert.match(await (await boss(showPath)).text(), /<h2>Admin<\/h2>/)
      assert.equal((await boss(`${showPath}/delete`, { method: 'POST' })).status, 303)
      assert.equal((await owner(showPath)).status, 404)
    })
  })

  it('still starts after a rollback, when the database is ahead of the code', async () => {
    // A newer release applied a migration, failed to start, and the runner
    // rolled back to this one.
    await db.exec(sql`
      insert into data_table_migrations (id, name, checksum, batch, applied_at)
      values ('9999', 'from_the_future', 'x', 99, '2099-01-01 00:00:00')
    `)
    try {
      await migrateDatabase()
      assert.equal((await browser()('/')).status, 200)
    } finally {
      await db.exec(sql`delete from data_table_migrations where id = '9999'`)
    }
  })

  it('refuses to start when an older migration has gone missing', async () => {
    await db.exec(sql`
      insert into data_table_migrations (id, name, checksum, batch, applied_at)
      values ('0000', 'ghost', 'x', 99, '2000-01-01 00:00:00')
    `)
    try {
      await assert.rejects(() => migrateDatabase(), /missing from current migrations/)
    } finally {
      await db.exec(sql`delete from data_table_migrations where id = '0000'`)
    }
  })

  it('does not serve files outside the image folder', async () => {
    let request = browser()
    for (let path of [
      '/images/..%2Fbehindme.sqlite',
      '/images/../behindme.sqlite',
      '/images/x.jpg',
    ]) {
      assert.equal((await request(path)).status, 404, path)
    }
  })

  it('asks search engines not to index anything', async () => {
    let request = browser()
    for (let path of ['/', '/styles.css', '/upload', '/no-such-page']) {
      let response = await request(path)
      assert.equal(response.headers.get('X-Robots-Tag'), ROBOTS, path)
    }
    let html = await (await request('/')).text()
    assert.match(html, /<meta name="robots" content="noindex, nofollow/)
    assert.match(
      html,
      /<meta property="og:image" content="http:\/\/localhost:44100\/og-default\.jpg"/,
    )
    // Crawlers must be allowed to fetch pages, or they'd never see the noindex.
    assert.match(await (await request('/robots.txt')).text(), /Allow: \//)
  })

  it('blocks cross-site form posts', async () => {
    let response = await browser()('/logout', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' },
    })
    assert.equal(response.status, 403)
  })
})
