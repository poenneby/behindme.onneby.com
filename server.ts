import * as http from 'node:http'
import { createRequestListener } from 'remix/node-fetch-server'

import { config } from './app/config.ts'
import { db, migrateDatabase } from './app/db.ts'
import { router } from './app/router.ts'

const port = config.port
const hmrProxyPort = process.env.HMR_PROXY_PORT
  ? Number.parseInt(process.env.HMR_PROXY_PORT, 10)
  : null
const isHmr = process.env.REMIX_NODE_HMR === '1'

await migrateDatabase()

const server = http.createServer(
  createRequestListener(router.fetch, {
    trustProxy: isHmr,
    onError(error) {
      console.error(error)
      return new Response('Something went wrong', { status: 500 })
    },
  }),
)

server.listen(port, () => {
  if (isHmr) {
    import('remix/node-hmr/runtime').then((nodeHmr) => nodeHmr.emitServerReady())
  }

  console.log(`Server listening on http://localhost:${hmrProxyPort ?? port}`)
})

let shuttingDown = false

function shutdown() {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  server.close(async () => {
    await db.close()
    process.exit(0)
  })
  server.closeAllConnections()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
