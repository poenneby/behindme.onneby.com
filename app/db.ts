import { mkdirSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations } from 'remix/data-table/migrations/node'
import { sql } from 'remix/data-table'
import { createSqliteDatabase } from 'remix/data-table/sqlite'

import { config } from './config.ts'

mkdirSync(config.dataDir, { recursive: true })

export const db = createSqliteDatabase({
  filename:
    process.env.NODE_ENV === 'test' ? ':memory:' : path.join(config.dataDir, 'behindme.sqlite'),
  foreignKeys: true,
})

/**
 * Applies pending migrations before the server starts.
 *
 * If the database already has migrations newer than this release knows
 * about, an older release is running after a newer one: the deploy runner
 * rolled back because a new release didn't start. The migration library
 * refuses to start in that case, which would turn a failed deploy into an
 * outage, so this skips migrating instead. That's safe because migrations
 * only ever add tables and columns (see db/migrations/README.md), so older
 * code keeps working against a newer database. Anything else unexpected,
 * such as an edited migration, still stops startup.
 */
export async function migrateDatabase() {
  let migrations = await loadMigrations(
    fileURLToPath(new URL('../db/migrations/', import.meta.url)),
  )
  let newer = await migrationsNewerThan(migrations.map((migration) => migration.id))
  if (newer.length > 0) {
    console.warn(
      `The database has migrations this release doesn't know (${newer.join(', ')}), ` +
        'probably from a newer release that was rolled back. Starting without migrating.',
    )
    return
  }
  await db.migrate(migrations)
}

/** Applied migrations later than every migration in `known`. */
async function migrationsNewerThan(known: string[]): Promise<string[]> {
  let journal = await db.exec(sql`
    select name from sqlite_master where type = 'table' and name = 'data_table_migrations'
  `)
  if (!journal.rows?.length) return []
  let applied = await db.exec(sql`select id, name from data_table_migrations order by id`)
  let latest = known.reduce((max, id) => (id > max ? id : max), '')
  let unknown = (applied.rows ?? []).filter((row) => !known.includes(String(row.id)))
  // Only skip when every unknown migration is newer than this release.
  // An unknown one in the middle means something else is wrong.
  if (unknown.length === 0 || unknown.some((row) => String(row.id) <= latest)) return []
  return unknown.map((row) => `${row.id}_${row.name}`)
}
