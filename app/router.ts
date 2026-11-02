import * as path from 'node:path'
import { createCookie } from 'remix/cookie'
import { compression } from 'remix/middleware/compression'
import { cop } from 'remix/middleware/cop'
import { formData } from 'remix/middleware/form-data'
import { logger } from 'remix/middleware/logger'
import { render } from 'remix/middleware/render'
import { session } from 'remix/middleware/session'
import { staticFiles } from 'remix/middleware/static'
import { createRouter, type RouterContext } from 'remix/router'
import { createFsSessionStorage } from 'remix/session-storage/fs'

import authController from './actions/auth/controller.tsx'
import backgroundsController from './actions/backgrounds/controller.tsx'
import controller from './actions/controller.tsx'
import locationsController from './actions/locations/controller.tsx'
import { assets } from './assets.ts'
import { config } from './config.ts'
import { MAX_UPLOAD_BYTES } from './images.ts'
import { loadAuth } from './middleware/auth.ts'
import { loadDatabase } from './middleware/database.ts'
import { noIndex } from './middleware/no-index.ts'
import { routes } from './routes.ts'

const sessionCookie = createCookie('__session', {
  secrets: [config.sessionSecret],
  httpOnly: true,
  // Cloudflare terminates TLS, so the app itself only ever sees http://.
  secure: config.isProduction,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
})

export const router = createRouter({
  middleware: [
    noIndex(),
    logger(),
    compression(),
    staticFiles('./public', { index: false }),
    // Rejects cross-site form posts using the browser's Sec-Fetch-Site/Origin.
    cop(),
    // Server-side sessions, so logging out really ends the session.
    session(sessionCookie, createFsSessionStorage(path.join(config.dataDir, 'sessions'))),
    loadDatabase(),
    loadAuth(),
    formData({
      maxFiles: 1,
      maxFileSize: MAX_UPLOAD_BYTES,
      maxParts: 20,
      maxTotalSize: MAX_UPLOAD_BYTES + 64 * 1024,
    }),
    render({ assets }),
  ],
})

export type AppContext = RouterContext<typeof router>

declare module 'remix' {
  interface RouterTypes {
    context: AppContext
  }
}

router.map(routes, controller)
router.map(routes.auth, authController)
router.map(routes.backgrounds, backgroundsController)
router.map(routes.locations, locationsController)
