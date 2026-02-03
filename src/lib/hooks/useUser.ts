'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addDebugLog } from '@/components/ui/ConnectionStatus'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase/types'

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  // Store client in ref - initialize after mount to avoid SSR issues
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  // Used to ignore stale profile fetches after rapid auth changes
  const profileRequestRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    // Initialize client on mount (client-side only)
    supabaseRef.current = createClient()
    const supabase = supabaseRef.current
    if (!supabase) {
      setLoading(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any
    addDebugLog('info', 'useUser init')

    const fetchProfile = async (userId: string, reason: string) => {
      const requestId = ++profileRequestRef.current
      try {
        const { data: profileData, error } = await client
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()

        if (cancelled || requestId !== profileRequestRef.current) return

        if (error) {
          addDebugLog('warn', 'useUser profile fetch failed', `${reason}: ${error.message}`)
          setProfile(null)
          return
        }

        setProfile(profileData as Profile | null)
      } catch (err) {
        if (cancelled || requestId !== profileRequestRef.current) return
        addDebugLog('error', 'useUser profile fetch exception', String(err))
        setProfile(null)
      }
    }

    const syncUserState = (nextUser: User | null, reason: string) => {
      if (cancelled) return
      setUser(nextUser)

      if (nextUser) {
        void fetchProfile(nextUser.id, reason)
      } else {
        profileRequestRef.current += 1
        setProfile(null)
      }
    }

    // Get initial session
    const getUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) {
          addDebugLog('warn', 'useUser getUser error', error.message)
        }
        syncUserState(user, 'initial')
      } catch (err) {
        addDebugLog('error', 'useUser getUser exception', String(err))
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void getUser()

    // Listen for auth changes
    // Important: keep this callback synchronous; Supabase warns async callbacks can deadlock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        addDebugLog('info', 'Auth event', event)
        // Queue follow-up work after callback returns to avoid lock contention.
        setTimeout(() => {
          syncUserState(session?.user ?? null, `auth:${event}`)
        }, 0)
      }
    )

    return () => {
      cancelled = true
      profileRequestRef.current += 1
      subscription.unsubscribe()
    }
  }, []) // Run only once on mount - supabase is memoized

  const signOut = async () => {
    const supabase = supabaseRef.current
    if (!supabase) return
    await supabase.auth.signOut()
  }

  const refreshProfile = async () => {
    if (!user) return
    const supabase = supabaseRef.current
    if (!supabase) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any

    const { data } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    setProfile(data as Profile | null)
  }

  return {
    user,
    profile,
    loading,
    signOut,
    refreshProfile,
  }
}
