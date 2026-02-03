'use client'

import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types'

// Singleton pattern - create client once and reuse
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  // Only create in browser environment
  if (typeof window === 'undefined') {
    // Return a dummy that will be replaced on client
    // This handles the case during static page generation
    return null as unknown as ReturnType<typeof createBrowserClient<Database>>
  }

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return browserClient
}
