import sharp from 'sharp'
import * as assert from 'remix/assert'
import { beforeAll, describe, it } from 'remix/test'

import { migrateDatabase } from './db.ts'
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

async function signUp(request: ReturnType<typeof browser>, email: string) {
  let response = await request(
    '/signup',
    form({ name: email.split('@')[0], email, password: 'a long enough password' }),
  )
  assert.equal(response.status, 303)
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
    assert.match(page, new RegExp(`<meta property="og:image" content="http://localhost:44100/images/${id}\\.jpg"`))
    assert.match(page, /<meta property="og:title" content="Rooftop/)
    assert.match(page, /<meta name="twitter:card" content="summary_large_image"/)

    let image = await owner(`/images/${id}.jpg`)
    assert.equal(image.headers.get('X-Robots-Tag'), ROBOTS)
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
    assert.match(html, /<meta property="og:image" content="http:\/\/localhost:44100\/og-default\.jpg"/)
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
