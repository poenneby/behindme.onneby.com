import { rawSql, sql } from 'remix/data-table'
import type { Database } from 'remix/data-table'

import { newId, slugify } from './ids.ts'
import { backgrounds, locations, ratings, type Location } from './tables.ts'

export type Sort = 'top' | 'new' | 'popular'

export interface BackgroundSummary {
  id: string
  title: string
  description: string
  teamsGuid: string
  animated: boolean
  downloads: number
  createdAt: number
  userId: string
  authorName: string
  locationName: string
  locationSlug: string
  rating: number
  ratingCount: number
}

export interface LocationSummary {
  slug: string
  name: string
  count: number
}

const ORDER_BY: Record<Sort, string> = {
  // Bayesian-ish: a single 5-star vote shouldn't beat twenty 4.8s.
  top: '((coalesce(sum(r.stars), 0) + 3 * 3.0) / (count(r.stars) + 3)) desc, b.created_at desc',
  new: 'b.created_at desc',
  popular: 'b.downloads desc, b.created_at desc',
}

const SELECT = `
  select
    b.id, b.title, b.description, b.teams_guid, b.animated, b.downloads, b.created_at, b.user_id,
    u.name as author_name, l.name as location_name, l.slug as location_slug,
    coalesce(avg(r.stars), 0) as rating, count(r.stars) as rating_count
  from backgrounds b
  join users u on u.id = b.user_id
  join locations l on l.id = b.location_id
  left join ratings r on r.background_id = b.id
`

function toSummary(row: Record<string, unknown>): BackgroundSummary {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ''),
    teamsGuid: String(row.teams_guid),
    animated: Number(row.animated) === 1,
    downloads: Number(row.downloads),
    createdAt: Number(row.created_at),
    userId: String(row.user_id),
    authorName: String(row.author_name),
    locationName: String(row.location_name),
    locationSlug: String(row.location_slug),
    rating: Number(row.rating),
    ratingCount: Number(row.rating_count),
  }
}

export async function listBackgrounds(
  db: Database,
  options: { sort?: Sort; locationSlug?: string; userId?: string; limit?: number } = {},
): Promise<BackgroundSummary[]> {
  let where: string[] = []
  let values: unknown[] = []
  if (options.locationSlug) {
    where.push('l.slug = ?')
    values.push(options.locationSlug)
  }
  if (options.userId) {
    where.push('b.user_id = ?')
    values.push(options.userId)
  }
  let text = `${SELECT}
    ${where.length ? `where ${where.join(' and ')}` : ''}
    group by b.id
    order by ${ORDER_BY[options.sort ?? 'top']}
    limit ?`
  values.push(options.limit ?? 200)
  let result = await db.exec(rawSql(text, values))
  return (result.rows ?? []).map(toSummary)
}

export async function getBackground(db: Database, id: string) {
  let result = await db.exec(rawSql(`${SELECT} where b.id = ? group by b.id`, [id]))
  let row = result.rows?.[0]
  return row ? toSummary(row) : null
}

export async function listLocations(db: Database): Promise<LocationSummary[]> {
  let result = await db.exec(sql`
    select l.slug, l.name, count(b.id) as count
    from locations l
    join backgrounds b on b.location_id = l.id
    group by l.id
    order by count desc, l.name asc
  `)
  return (result.rows ?? []).map((row) => ({
    slug: String(row.slug),
    name: String(row.name),
    count: Number(row.count),
  }))
}

export async function getLocation(db: Database, slug: string): Promise<Location | null> {
  return db.findOne(locations, { where: { slug } })
}

/** Finds a location by its slug, creating it from the typed name if it's new. */
export async function findOrCreateLocation(db: Database, name: string): Promise<Location> {
  let cleanName = name.trim().replace(/\s+/g, ' ')
  let slug = slugify(cleanName)
  let existing = await getLocation(db, slug)
  if (existing) return existing
  let location = { id: newId(), slug, name: cleanName, created_at: Date.now() }
  await db.create(locations, location)
  return location
}

export async function createBackground(
  db: Database,
  input: {
    id: string
    teamsGuid: string
    userId: string
    locationId: string
    title: string
    description: string
    animated: boolean
  },
) {
  await db.create(backgrounds, {
    id: input.id,
    user_id: input.userId,
    location_id: input.locationId,
    title: input.title,
    description: input.description,
    teams_guid: input.teamsGuid,
    animated: input.animated ? 1 : 0,
    downloads: 0,
    created_at: Date.now(),
  })
}

export async function deleteBackground(db: Database, id: string) {
  await db.delete(backgrounds, id)
  // Drop locations nobody uses any more so the list stays tidy.
  await db.exec(sql`
    delete from locations where id not in (select distinct location_id from backgrounds)
  `)
}

export async function countDownload(db: Database, ids: string[]) {
  for (let id of ids) {
    await db.exec(sql`update backgrounds set downloads = downloads + 1 where id = ${id}`)
  }
}

export async function rateBackground(
  db: Database,
  input: { backgroundId: string; userId: string; stars: number },
) {
  await db.exec(sql`
    insert into ratings (background_id, user_id, stars, created_at)
    values (${input.backgroundId}, ${input.userId}, ${input.stars}, ${Date.now()})
    on conflict (background_id, user_id) do update set stars = excluded.stars
  `)
}

export async function getUserRating(db: Database, backgroundId: string, userId: string) {
  let row = await db.findOne(ratings, { where: { background_id: backgroundId, user_id: userId } })
  return row?.stars ?? null
}
