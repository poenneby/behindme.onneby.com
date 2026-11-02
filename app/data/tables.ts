import { column as c, table } from 'remix/data-table'
import type { TableRow } from 'remix/data-table'

export const users = table({
  name: 'users',
  columns: {
    id: c.text(),
    email: c.text(),
    name: c.text(),
    password_hash: c.text(),
    created_at: c.integer(),
  },
})

export const locations = table({
  name: 'locations',
  columns: {
    id: c.text(),
    slug: c.text(),
    name: c.text(),
    created_at: c.integer(),
  },
})

export const backgrounds = table({
  name: 'backgrounds',
  columns: {
    id: c.text(),
    user_id: c.text(),
    location_id: c.text(),
    title: c.text(),
    description: c.text(),
    teams_guid: c.text(),
    downloads: c.integer(),
    created_at: c.integer(),
    /** 1 for an animated GIF, 0 for a still photo. */
    animated: c.integer(),
  },
})

export const ratings = table({
  name: 'ratings',
  primaryKey: ['background_id', 'user_id'],
  columns: {
    background_id: c.text(),
    user_id: c.text(),
    stars: c.integer(),
    created_at: c.integer(),
  },
})

export type User = TableRow<typeof users>
export type Location = TableRow<typeof locations>
export type Background = TableRow<typeof backgrounds>
