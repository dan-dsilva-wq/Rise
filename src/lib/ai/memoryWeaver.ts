import type { SupabaseClient } from '@supabase/supabase-js'

import { weaveMemory, type WovenMemory } from './memory-weaver/weave'
import { synthesizeUserThread, type UserThread } from './memory-weaver/user-thread'

export * from './memory-weaver/shared'
export * from './memory-weaver/greetings'
export { weaveMemory } from './memory-weaver/weave'
export type { WovenMemory } from './memory-weaver/weave'
export { synthesizeUserThread } from './memory-weaver/user-thread'
export type { UserThread } from './memory-weaver/user-thread'

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const MEMORY_CACHE_TTL = 5 * 60 * 1000
const USER_THREAD_CACHE_TTL = 10 * 60 * 1000
const serverCache = new Map<string, CacheEntry<unknown>>()

let lastCleanup = 0

function cleanupCache() {
  const now = Date.now()
  if (now - lastCleanup < 60_000) return

  lastCleanup = now
  for (const [key, entry] of serverCache) {
    if (now > entry.expiresAt) {
      serverCache.delete(key)
    }
  }
}

function getCached<T>(key: string): T | null {
  const entry = serverCache.get(key)
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) {
      serverCache.delete(key)
    }
    return null
  }

  return entry.data as T
}

function setCached<T>(key: string, data: T, ttl: number) {
  cleanupCache()
  serverCache.set(key, { data, expiresAt: Date.now() + ttl })
}

export async function cachedWeaveMemory(
  client: SupabaseClient,
  userId: string,
  options: Parameters<typeof weaveMemory>[2] = {},
): Promise<WovenMemory> {
  const cacheKey = `wm:${userId}:${options.currentSource || 'all'}:${options.projectId || 'none'}`
  const cached = getCached<WovenMemory>(cacheKey)

  if (cached) {
    return cached
  }

  const result = await weaveMemory(client, userId, options)
  setCached(cacheKey, result, MEMORY_CACHE_TTL)
  return result
}

export async function cachedSynthesizeUserThread(
  client: SupabaseClient,
  userId: string,
  options: Parameters<typeof synthesizeUserThread>[2] = {},
): Promise<UserThread> {
  const cacheKey = `ut:${userId}`
  const cached = getCached<UserThread>(cacheKey)

  if (cached) {
    return cached
  }

  const result = await synthesizeUserThread(client, userId, options)
  setCached(cacheKey, result, USER_THREAD_CACHE_TTL)
  return result
}
