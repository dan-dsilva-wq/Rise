'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase/types'

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  useEffect(() => {
    // Get initial session
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const { data: profileData } = await client
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        setProfile(profileData as Profile | null)
      }

      setLoading(false)
    }

    getUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)

        if (session?.user) {
          const { data: profileData } = await client
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()

          setProfile(profileData as Profile | null)
        } else {
          setProfile(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, client])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const refreshProfile = async () => {
    if (!user) return

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
