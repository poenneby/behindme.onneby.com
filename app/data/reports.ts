import { sql } from 'remix/data-table'
import type { Database } from 'remix/data-table'

import { newId } from './ids.ts'

export interface OpenReport {
  backgroundId: string
  reasons: { reporter: string; reason: string; createdAt: number }[]
}

/** Records (or updates) one person's report about a background. */
export async function reportBackground(
  db: Database,
  input: { backgroundId: string; userId: string; reason: string },
) {
  await db.exec(sql`
    insert into reports (id, background_id, user_id, reason, created_at, resolved_at)
    values (${newId()}, ${input.backgroundId}, ${input.userId}, ${input.reason}, ${Date.now()}, null)
    on conflict (background_id, user_id)
      do update set reason = excluded.reason, created_at = excluded.created_at, resolved_at = null
  `)
}

/** Unresolved reports, grouped by background, oldest first. */
export async function listOpenReports(db: Database): Promise<OpenReport[]> {
  let result = await db.exec(sql`
    select r.background_id, r.reason, r.created_at, u.name as reporter
    from reports r
    join users u on u.id = r.user_id
    where r.resolved_at is null
    order by r.created_at asc
  `)
  let byBackground = new Map<string, OpenReport>()
  for (let row of result.rows ?? []) {
    let id = String(row.background_id)
    let entry = byBackground.get(id) ?? { backgroundId: id, reasons: [] }
    entry.reasons.push({
      reporter: String(row.reporter),
      reason: String(row.reason),
      createdAt: Number(row.created_at),
    })
    byBackground.set(id, entry)
  }
  return [...byBackground.values()]
}

/** Keeps the background and closes its open reports. */
export async function dismissReports(db: Database, backgroundId: string) {
  await db.exec(sql`
    update reports set resolved_at = ${Date.now()}
    where background_id = ${backgroundId} and resolved_at is null
  `)
}
