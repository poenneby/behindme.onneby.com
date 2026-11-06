import { rawSql, sql } from 'remix/data-table'
import type { Database } from 'remix/data-table'

import { newId, slugify } from './ids.ts'
import { backgrounds, categories, ratings, type Category } from './tables.ts'

export type Sort = 'top' | 'new' | 'popular'
export type Status = 'pending' | 'approved' | 'rejected'

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
  categoryName: string
  categorySlug: string
  rating: number
  ratingCount: number
  status: Status
  /** Why an admin didn't approve it, if they said. Shown to the uploader. */
  rejectionReason: string | null
}

/** Approved backgrounds are public; others only to their uploader and admins. */
export function canSee(
  background: Pick<BackgroundSummary, 'status' | 'userId'>,
  viewer: { id: string; role: string } | null,
) {
  return (
    background.status === 'approved' || viewer?.role === 'admin' || viewer?.id === background.userId
  )
}

export interface CategorySummary {
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
    b.status, b.rejection_reason,
    u.name as author_name, c.name as category_name, c.slug as category_slug,
    coalesce(avg(r.stars), 0) as rating, count(r.stars) as rating_count
  from backgrounds b
  join users u on u.id = b.user_id
  join categories c on c.id = b.category_id
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
    categoryName: String(row.category_name),
    categorySlug: String(row.category_slug),
    rating: Number(row.rating),
    ratingCount: Number(row.rating_count),
    status: String(row.status) as Status,
    rejectionReason: row.rejection_reason === null ? null : String(row.rejection_reason),
  }
}

export async function listBackgrounds(
  db: Database,
  options: {
    sort?: Sort
    categorySlug?: string
    userId?: string
    limit?: number
    /** Defaults to approved only, which is what everyone may see. */
    status?: Status | 'any'
  } = {},
): Promise<BackgroundSummary[]> {
  let where: string[] = []
  let values: unknown[] = []
  let status = options.status ?? 'approved'
  if (status !== 'any') {
    where.push('b.status = ?')
    values.push(status)
  }
  if (options.categorySlug) {
    where.push('c.slug = ?')
    values.push(options.categorySlug)
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

export async function listCategories(db: Database): Promise<CategorySummary[]> {
  let result = await db.exec(sql`
    select c.slug, c.name, count(b.id) as count
    from categories c
    join backgrounds b on b.category_id = c.id and b.status = 'approved'
    group by c.id
    order by count desc, c.name asc
  `)
  return (result.rows ?? []).map((row) => ({
    slug: String(row.slug),
    name: String(row.name),
    count: Number(row.count),
  }))
}

export async function getCategory(db: Database, slug: string): Promise<Category | null> {
  return db.findOne(categories, { where: { slug } })
}

/** Finds a category by its slug, creating it from the typed name if it's new. */
export async function findOrCreateCategory(db: Database, name: string): Promise<Category> {
  let cleanName = name.trim().replace(/\s+/g, ' ')
  let slug = slugify(cleanName)
  let existing = await getCategory(db, slug)
  if (existing) return existing
  let category = { id: newId(), slug, name: cleanName, created_at: Date.now() }
  await db.create(categories, category)
  return category
}

export async function createBackground(
  db: Database,
  input: {
    id: string
    teamsGuid: string
    userId: string
    categoryId: string
    title: string
    description: string
    animated: boolean
    status: Status
  },
) {
  await db.create(backgrounds, {
    id: input.id,
    user_id: input.userId,
    category_id: input.categoryId,
    title: input.title,
    description: input.description,
    teams_guid: input.teamsGuid,
    animated: input.animated ? 1 : 0,
    downloads: 0,
    created_at: Date.now(),
    status: input.status,
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,
  })
}

/** Records an admin's decision. */
export async function reviewBackground(
  db: Database,
  id: string,
  decision: { status: 'approved' | 'rejected'; reviewerId: string; reason?: string },
) {
  await db.update(backgrounds, id, {
    status: decision.status,
    reviewed_at: Date.now(),
    reviewed_by: decision.reviewerId,
    rejection_reason: decision.status === 'rejected' ? decision.reason?.trim() || null : null,
  })
}

/** Changes a background's title, description or category. */
export async function editBackground(
  db: Database,
  id: string,
  changes: { title: string; description: string; categoryId: string },
) {
  await db.update(backgrounds, id, {
    title: changes.title,
    description: changes.description,
    category_id: changes.categoryId,
  })
  await dropUnusedCategories(db)
}

/** Every category with its backgrounds of any status, for admins. */
export async function listAllCategories(
  db: Database,
): Promise<(CategorySummary & { id: string })[]> {
  let result = await db.exec(sql`
    select c.id, c.slug, c.name, count(b.id) as count
    from categories c
    left join backgrounds b on b.category_id = c.id
    group by c.id
    order by c.name collate nocase asc
  `)
  return (result.rows ?? []).map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    count: Number(row.count),
  }))
}

/**
 * Renames a category. If another category already has the new name (or the
 * same address), its backgrounds are merged into that one instead.
 */
export async function renameCategory(
  db: Database,
  slug: string,
  newName: string,
): Promise<{ result: 'renamed' | 'merged' | 'unchanged'; category: Category } | null> {
  let category = await getCategory(db, slug)
  if (!category) return null
  let name = newName.trim().replace(/\s+/g, ' ')
  let newSlug = slugify(name)
  if (newSlug === category.slug) {
    if (name === category.name) return { result: 'unchanged', category }
    await db.update(categories, category.id, { name })
    return { result: 'renamed', category: { ...category, name } }
  }
  let target = await getCategory(db, newSlug)
  if (target) {
    await db.exec(sql`
      update backgrounds set category_id = ${target.id} where category_id = ${category.id}
    `)
    await db.delete(categories, category.id)
    return { result: 'merged', category: target }
  }
  await db.update(categories, category.id, { name, slug: newSlug })
  return { result: 'renamed', category: { ...category, name, slug: newSlug } }
}

async function dropUnusedCategories(db: Database) {
  await db.exec(sql`
    delete from categories where id not in (select distinct category_id from backgrounds)
  `)
}

export async function deleteBackground(db: Database, id: string) {
  await db.delete(backgrounds, id)
  // Drop categories nobody uses any more so the list stays tidy.
  await dropUnusedCategories(db)
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
