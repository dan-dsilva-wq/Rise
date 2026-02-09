'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  getCurrentPermission,
  getCurrentPushSubscription,
  isPushSupported,
  PushPermissionState,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/notifications/pushClient'

interface SubscriptionStatusResponse {
  active?: boolean
  count?: number
  latestUpdatedAt?: string | null
  error?: string
}

interface TestNotificationResponse {
  success?: boolean
  error?: string
}

interface UsePushNotificationsResult {
  supported: boolean
  permission: PushPermissionState
  subscribed: boolean
  serverCount: number
  latestUpdatedAt: string | null
  loading: boolean
  syncing: boolean
  testing: boolean
  error: string | null
  setError: (value: string | null) => void
  refresh: () => Promise<void>
  enable: () => Promise<boolean>
  disable: () => Promise<boolean>
  sendTest: () => Promise<boolean>
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

export function usePushNotifications(): UsePushNotificationsResult {
  const supported = useMemo(() => isPushSupported(), [])
  const [permission, setPermission] = useState<PushPermissionState>(getCurrentPermission())
  const [subscribed, setSubscribed] = useState(false)
  const [serverCount, setServerCount] = useState(0)
  const [latestUpdatedAt, setLatestUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!supported) {
      setPermission('unsupported')
      setSubscribed(false)
      setServerCount(0)
      setLatestUpdatedAt(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [localSubscription, statusResponse] = await Promise.all([
        getCurrentPushSubscription(),
        fetch('/api/notifications/subscription', { method: 'GET' }),
      ])

      setPermission(getCurrentPermission())
      setSubscribed(Boolean(localSubscription))

      if (!statusResponse.ok) {
        const payload = (await statusResponse.json().catch(() => ({}))) as SubscriptionStatusResponse
        throw new Error(payload.error || 'Failed to fetch notification subscription status.')
      }

      const statusPayload = (await statusResponse.json()) as SubscriptionStatusResponse
      setServerCount(statusPayload.count || 0)
      setLatestUpdatedAt(statusPayload.latestUpdatedAt || null)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh notification status.'
      setError(message)
      setServerCount(0)
      setLatestUpdatedAt(null)
    } finally {
      setLoading(false)
    }
  }, [supported])

  const enable = useCallback(async (): Promise<boolean> => {
    if (!supported) {
      setError('Push notifications are not supported in this browser.')
      return false
    }

    setSyncing(true)
    try {
      if (!VAPID_PUBLIC_KEY) {
        throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing.')
      }

      const subscription = await subscribeToPush(VAPID_PUBLIC_KEY)
      const response = await fetch('/api/notifications/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription,
          userAgent: navigator.userAgent,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as SubscriptionStatusResponse
        throw new Error(payload.error || 'Failed to save push subscription.')
      }

      setPermission(getCurrentPermission())
      setSubscribed(true)
      setError(null)
      await refresh()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enable notifications.'
      setError(message)
      setPermission(getCurrentPermission())
      await refresh()
      return false
    } finally {
      setSyncing(false)
    }
  }, [refresh, supported])

  const disable = useCallback(async (): Promise<boolean> => {
    if (!supported) return false

    setSyncing(true)
    try {
      const { endpoint } = await unsubscribeFromPush()
      const response = await fetch('/api/notifications/subscription', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endpoint ? { endpoint } : {}),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as SubscriptionStatusResponse
        throw new Error(payload.error || 'Failed to disable notifications.')
      }

      setSubscribed(false)
      setError(null)
      await refresh()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disable notifications.'
      setError(message)
      await refresh()
      return false
    } finally {
      setSyncing(false)
    }
  }, [refresh, supported])

  const sendTest = useCallback(async (): Promise<boolean> => {
    setTesting(true)
    try {
      const response = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const payload = (await response.json().catch(() => ({}))) as TestNotificationResponse
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || 'Failed to send test notification.')
      }

      setError(null)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send test notification.'
      setError(message)
      return false
    } finally {
      setTesting(false)
    }
  }, [])

  return {
    supported,
    permission,
    subscribed,
    serverCount,
    latestUpdatedAt,
    loading,
    syncing,
    testing,
    error,
    setError,
    refresh,
    enable,
    disable,
    sendTest,
  }
}
