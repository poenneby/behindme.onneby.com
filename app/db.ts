import { mkdirSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations } from 'remix/data-table/migrations/node'
import { createSqliteDatabase } from 'remix/data-table/sqlite'

import { config } from './config.ts'

mkdirSync(config.dataDir, { recursive: true })

export const db = createSqliteDatabase({
  filename:
    process.env.NODE_ENV === 'test' ? ':memory:' : path.join(config.dataDir, 'behindme.sqlite'),
  foreignKeys: true,
})

export async function migrateDatabase() {
  let migrations = await loadMigrations(
    fileURLToPath(new URL('../db/migrations/', import.meta.url)),
  )
  await db.migrate(migrations)
}
