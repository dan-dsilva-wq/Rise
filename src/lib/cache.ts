'use client'

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const cache = new Map<string, CacheEntry<unknown>>()
const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes

export function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null

  if (Date.now() - entry.timestamp > DEFAULT_TTL) {
    cache.delete(key)
    return null
  }

  return entry.data
}

export function setCache<T>(key: string, data: T): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  })
}

export function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    cache.clear()
    return
  }

  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key)
    }
  }
}

export function getCacheKey(userId: string, resource: string): string {
  return `${userId}:${resource}`
}
