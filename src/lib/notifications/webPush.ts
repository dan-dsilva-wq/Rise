import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import type { Database, PushSubscription as PushSubscriptionRecord } from '@/lib/supabase/types'

export interface NotificationPayload {
  title: string
  body: string
  url?: string
  tag?: string
  requireInteraction?: boolean
  data?: Record<string, unknown>
}

export interface PushDeliveryResult {
  attempted: number
  delivered: number
  failed: number
  deactivated: number
  skipped: boolean
  reason?: string
}

interface WebPushError extends Error {
  statusCode?: number
  body?: string
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:no-reply@rise.app'
const MAX_ERROR_CHARS = 1000

let webPushConfigured = false

function trimErrorText(input: string): string {
  if (input.length <= MAX_ERROR_CHARS) return input
  return `${input.slice(0, MAX_ERROR_CHARS)}...`
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return trimErrorText(error.message)
  return 'Unknown push delivery error'
}

function toWebPushSubscription(
  subscription: Pick<PushSubscriptionRecord, 'endpoint' | 'p256dh' | 'auth' | 'expiration_time'>
): webpush.PushSubscription {
  return {
    endpoint: subscription.endpoint,
    expirationTime:
      typeof subscription.expiration_time === 'number' ? subscription.expiration_time : null,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  }
}

function configureWebPush(): boolean {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return false
  }

  if (!webPushConfigured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    webPushConfigured = true
  }

  return true
}

function isExpiredSubscriptionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as WebPushError).statusCode
  return code === 404 || code === 410
}

async function markDeliverySuccess(
  client: SupabaseClient<Database>,
  subscriptionId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any
  const { error } = await db
    .from('push_subscriptions')
    .update({
      last_success_at: new Date().toISOString(),
      last_error: null,
      is_active: true,
    })
    .eq('id', subscriptionId)

  if (error) {
    console.error('Failed to update push subscription success state:', error.message)
  }
}

async function markDeliveryFailure(
  client: SupabaseClient<Database>,
  subscriptionId: string,
  errorMessage: string,
  deactivate: boolean
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any
  const { error } = await db
    .from('push_subscriptions')
    .update({
      last_error: trimErrorText(errorMessage),
      is_active: deactivate ? false : true,
    })
    .eq('id', subscriptionId)

  if (error) {
    console.error('Failed to update push subscription failure state:', error.message)
  }
}

function buildPayload(payload: NotificationPayload): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    tag: payload.tag || 'rise-notification',
    requireInteraction: Boolean(payload.requireInteraction),
    data: payload.data || {},
    sentAt: new Date().toISOString(),
  })
}

export function hasWebPushConfiguration(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
}

export async function sendPushToUser(
  client: SupabaseClient<Database>,
  userId: string,
  payload: NotificationPayload
): Promise<PushDeliveryResult> {
  if (!configureWebPush()) {
    return {
      attempted: 0,
      delivered: 0,
      failed: 0,
      deactivated: 0,
      skipped: true,
      reason: 'Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY.',
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any
  const { data: subscriptions, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, expiration_time')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error) {
    throw new Error(error.message)
  }

  if (!subscriptions || subscriptions.length === 0) {
    return {
      attempted: 0,
      delivered: 0,
      failed: 0,
      deactivated: 0,
      skipped: false,
      reason: 'No active push subscriptions found.',
    }
  }

  const body = buildPayload(payload)

  let delivered = 0
  let failed = 0
  let deactivated = 0

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(toWebPushSubscription(subscription), body)
      delivered += 1
      await markDeliverySuccess(client, subscription.id)
    } catch (error) {
      failed += 1
      const deactivate = isExpiredSubscriptionError(error)
      if (deactivate) {
        deactivated += 1
      }
      const message = toErrorMessage(error)
      await markDeliveryFailure(client, subscription.id, message, deactivate)
    }
  }

  return {
    attempted: subscriptions.length,
    delivered,
    failed,
    deactivated,
    skipped: false,
  }
}
