'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Achievement, Profile } from '@/lib/supabase/types'

interface UnlockedAchievement extends Achievement {
  unlocked_at: string
}

interface UserAchievementRow {
  achievements: Achievement
  unlocked_at: string
}

export function useAchievements(userId: string | undefined) {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [unlocked, setUnlocked] = useState<UnlockedAchievement[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchAchievements = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any

    // Get all achievements
    const { data: allAchievements } = await client
      .from('achievements')
      .select('*')
      .order('display_order')

    setAchievements((allAchievements as Achievement[]) || [])

    // Get user's unlocked achievements
    const { data: userAchievements } = await client
      .from('user_achievements')
      .select('*, achievements(*)')
      .eq('user_id', userId)

    if (userAchievements) {
      const mapped = (userAchievements as UserAchievementRow[]).map((ua) => ({
        ...ua.achievements,
        unlocked_at: ua.unlocked_at,
      }))
      setUnlocked(mapped)
    }

    setLoading(false)
  }, [userId, supabase])

  useEffect(() => {
    fetchAchievements()
  }, [fetchAchievements])

  // Check if an achievement should be unlocked
  const checkAchievement = useCallback(
    async (profile: Profile): Promise<Achievement | null> => {
      if (!userId) return null

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any

      // Get already unlocked achievement codes
      const unlockedCodes = new Set(unlocked.map((a) => a.code))

      // Check each achievement
      for (const achievement of achievements) {
        if (unlockedCodes.has(achievement.code)) continue

        const condition = achievement.unlock_condition as {
          type: string
          value: number | string
        }

        let shouldUnlock = false

        switch (condition.type) {
          case 'streak':
            shouldUnlock = profile.current_streak >= (condition.value as number)
            break
          case 'total_xp':
            shouldUnlock = profile.total_xp >= (condition.value as number)
            break
          case 'tier':
            shouldUnlock = profile.unlock_tier >= (condition.value as number)
            break
          case 'morning_count':
            // Need to count morning logs
            const { count } = await client
              .from('daily_logs')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', userId)
              .not('im_up_pressed_at', 'is', null)
            shouldUnlock = (count || 0) >= (condition.value as number)
            break
        }

        if (shouldUnlock) {
          // Unlock the achievement
          await client.from('user_achievements').insert({
            user_id: userId,
            achievement_id: achievement.id,
          })

          // Award XP
          await client.rpc('increment_xp', {
            user_id: userId,
            xp_amount: achievement.xp_reward,
          })

          // Refresh and return the unlocked achievement
          await fetchAchievements()
          return achievement
        }
      }

      return null
    },
    [userId, achievements, unlocked, supabase, fetchAchievements]
  )

  return {
    achievements,
    unlocked,
    loading,
    checkAchievement,
    refresh: fetchAchievements,
  }
}
