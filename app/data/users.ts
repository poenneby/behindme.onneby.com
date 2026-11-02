import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { Database } from 'remix/data-table'

import { newId } from './ids.ts'
import { users, type User } from './tables.ts'

export type Identity = Pick<User, 'id' | 'email' | 'name'>

const KEY_LENGTH = 64

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 }, (error, key) =>
      error ? reject(error) : resolve(key),
    )
  })
}

export async function hashPassword(password: string): Promise<string> {
  let salt = randomBytes(16)
  let key = await scryptAsync(password, salt)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  let [scheme, salt, key] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !key) return false
  let expected = Buffer.from(key, 'base64')
  let actual = await scryptAsync(password, Buffer.from(salt, 'base64'))
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function findUserByEmail(db: Database, email: string) {
  return db.findOne(users, { where: { email: normalizeEmail(email) } })
}

export async function createUser(
  db: Database,
  input: { email: string; name: string; password: string },
): Promise<Identity> {
  let user = {
    id: newId(),
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    password_hash: await hashPassword(input.password),
    created_at: Date.now(),
  }
  await db.create(users, user)
  return { id: user.id, email: user.email, name: user.name }
}

// A fixed hash to compare against when the email is unknown, so login timing
// doesn't reveal which emails have accounts.
const dummyHash = await hashPassword(randomBytes(16).toString('hex'))

export async function verifyLogin(
  db: Database,
  email: string,
  password: string,
): Promise<Identity | null> {
  let user = await findUserByEmail(db, email)
  let ok = await checkPassword(password, user?.password_hash ?? dummyHash)
  if (!user || !ok) return null
  return { id: user.id, email: user.email, name: user.name }
}

export async function getIdentity(db: Database, userId: string): Promise<Identity | null> {
  let user = await db.find(users, userId)
  return user ? { id: user.id, email: user.email, name: user.name } : null
}
