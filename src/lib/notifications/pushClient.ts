'use client'

export type PushPermissionState = NotificationPermission | 'unsupported'

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return buffer
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false

  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export function getCurrentPermission(): PushPermissionState {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<PushPermissionState> {
  if (!isPushSupported()) return 'unsupported'

  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'

  const permission = await Notification.requestPermission()
  return permission
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser.')
  }

  const readyRegistration = await navigator.serviceWorker.ready.catch(() => null)
  if (readyRegistration) return readyRegistration

  await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null

  const registration = await ensureServiceWorkerRegistration()
  return registration.pushManager.getSubscription()
}

export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser.')
  }

  if (!window.isSecureContext) {
    throw new Error('Push notifications require HTTPS (or localhost).')
  }

  if (!vapidPublicKey || !vapidPublicKey.trim()) {
    throw new Error('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.')
  }

  const permission = await requestNotificationPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked in browser settings.'
        : 'Notification permission was not granted.'
    )
  }

  const registration = await ensureServiceWorkerRegistration()
  const existing = await registration.pushManager.getSubscription()
  if (existing) return existing

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey.trim()),
  })
}

export async function unsubscribeFromPush(): Promise<{ endpoint: string | null }> {
  const subscription = await getCurrentPushSubscription()
  if (!subscription) {
    return { endpoint: null }
  }

  const endpoint = subscription.endpoint || null
  await subscription.unsubscribe()
  return { endpoint }
}
