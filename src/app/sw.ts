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
