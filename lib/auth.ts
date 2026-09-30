import 'server-only'
import type { User } from '@supabase/supabase-js'
import { createClient } from './supabase/server'

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
  }
}

/**
 * The signed-in user for this request, verified with the Supabase Auth server.
 * The user id always comes from the session, never from the request body.
 */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

export async function requireUser(): Promise<User> {
  const user = await getUser()
  if (!user) throw new UnauthorizedError()
  return user
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
