/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import { Serwist, NetworkFirst, NetworkOnly } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis;

// Custom caching rules - network-first for API and Supabase
const runtimeCaching: RuntimeCaching[] = [
  // Always hit network for navigations to avoid stale route-level 404s
  {
    matcher: ({ request }) => request.mode === 'navigate',
    handler: new NetworkOnly(),
  },
  // Never cache Supabase API calls
  {
    matcher: ({ url }) => url.hostname.includes('supabase'),
    handler: new NetworkOnly(),
  },
  // Network-first for our API routes
  {
    matcher: ({ url }) => url.pathname.startsWith('/api/'),
    handler: new NetworkFirst({
      cacheName: 'api-cache',
      networkTimeoutSeconds: 10,
    }),
  },
  // Use default cache for everything else
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

serwist.addEventListeners();

interface PushWorkerScope extends WorkerGlobalScope {
  addEventListener(type: string, listener: (event: Event) => void): void;
  registration: ServiceWorkerRegistration;
  clients: Clients;
  location: Location;
}

const pushWorker = self as unknown as PushWorkerScope;

interface PushEventPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
}

pushWorker.addEventListener('push', event => {
  const pushEvent = event as PushEvent;
  const fallbackTitle = 'Rise';
  const fallbackBody = 'You have a new update.';

  let payload: PushEventPayload = {};
  if (pushEvent.data) {
    try {
      payload = pushEvent.data.json() as PushEventPayload;
    } catch {
      payload = { body: pushEvent.data.text() };
    }
  }

  const title = payload.title || fallbackTitle;
  const options: NotificationOptions = {
    body: payload.body || fallbackBody,
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: payload.tag || 'rise-notification',
    requireInteraction: Boolean(payload.requireInteraction),
    data: {
      url: payload.url || '/',
      ...(payload.data || {}),
    },
  };

  pushEvent.waitUntil(pushWorker.registration.showNotification(title, options));
});

pushWorker.addEventListener('notificationclick', event => {
  const clickEvent = event as NotificationEvent;
  clickEvent.notification.close();

  const targetUrl = (() => {
    const value = clickEvent.notification?.data?.url;
    return typeof value === 'string' && value.trim().length > 0 ? value : '/';
  })();

  clickEvent.waitUntil(
    pushWorker.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          const windowClient = client as WindowClient;
          const currentPath = new URL(windowClient.url).pathname;
          const desiredPath = new URL(targetUrl, pushWorker.location.origin).pathname;

          if (currentPath === desiredPath) {
            return windowClient.focus();
          }
        }
      }

      if (pushWorker.clients.openWindow) {
        return pushWorker.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
