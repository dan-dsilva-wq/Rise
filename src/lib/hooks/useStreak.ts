'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { subDays, parseISO } from 'date-fns'

// Use UTC date to match server-side (Vercel runs in UTC)
function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0]
}

interface StreakInfo {
  current: number
  longest: number
  lastActiveDate: string | null
  graceDayAvailable: boolean
  graceDayUsedToday: boolean
}

interface ProfileData {
  current_streak: number
  longest_streak: number
  grace_days_used_this_week: number
  week_start_date: string
}

interface LogData {
  log_date: string
  im_up_pressed_at: string | null
}

export function useStreak(userId: string | undefined) {
  const [streakInfo, setStreakInfo] = useState<StreakInfo>({
    current: 0,
    longest: 0,
    lastActiveDate: null,
    graceDayAvailable: true,
    graceDayUsedToday: false,
  })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  const calculateStreak = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    // Get profile for streak data
    const { data: profile } = await client
      .from('profiles')
      .select('current_streak, longest_streak, grace_days_used_this_week, week_start_date')
      .eq('id', userId)
      .single() as { data: ProfileData | null }

    // Get recent logs to calculate streak
    const { data: logs } = await client
      .from('daily_logs')
      .select('log_date, im_up_pressed_at')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(60) as { data: LogData[] | null }

    if (!logs || logs.length === 0) {
      setStreakInfo({
        current: 0,
        longest: profile?.longest_streak || 0,
        lastActiveDate: null,
        graceDayAvailable: true,
        graceDayUsedToday: false,
      })
      setLoading(false)
      return
    }

    // Calculate current streak
    const today = getUtcDateString()
    const yesterday = getUtcDateString(subDays(new Date(), 1))

    let streak = 0
    let lastActiveDate: string | null = null
    let i = 0

    // Check if today has a log
    if (logs[0]?.log_date === today) {
      streak = 1
      lastActiveDate = today
      i = 1
    } else if (logs[0]?.log_date === yesterday) {
      // Started yesterday, check if grace day applies
      lastActiveDate = yesterday
    } else {
      // Gap too big, streak broken
      setStreakInfo({
        current: 0,
        longest: profile?.longest_streak || 0,
        lastActiveDate: logs[0]?.log_date || null,
        graceDayAvailable: (profile?.grace_days_used_this_week || 0) < 1,
        graceDayUsedToday: false,
      })
      setLoading(false)
      return
    }

    // Count consecutive days
    for (; i < logs.length; i++) {
      const currentDate = parseISO(logs[i].log_date)
      const expectedDate = subDays(
        i === 0 ? new Date() : parseISO(logs[i - 1].log_date),
        1
      )

      if (getUtcDateString(currentDate) === getUtcDateString(expectedDate)) {
        streak++
      } else {
        break
      }
    }

    // Check week reset for grace days
    const graceDaysUsed = profile?.grace_days_used_this_week || 0
    const graceDayAvailable = graceDaysUsed < 1

    setStreakInfo({
      current: streak,
      longest: Math.max(streak, profile?.longest_streak || 0),
      lastActiveDate,
      graceDayAvailable,
      graceDayUsedToday: false,
    })

    setLoading(false)
  }, [userId, client])

  useEffect(() => {
    calculateStreak()
  }, [calculateStreak])

  // Update streak in profile
  const updateStreak = async (newStreak: number) => {
    if (!userId) return

    await client
      .from('profiles')
      .update({
        current_streak: newStreak,
        longest_streak: Math.max(newStreak, streakInfo.longest),
      })
      .eq('id', userId)

    await calculateStreak()
  }

  // Use a grace day
  const useGraceDay = async () => {
    if (!userId || !streakInfo.graceDayAvailable) return false

    await client
      .from('profiles')
      .update({
        grace_days_used_this_week: 1,
      })
      .eq('id', userId)

    setStreakInfo((prev) => ({
      ...prev,
      graceDayAvailable: false,
      graceDayUsedToday: true,
    }))

    return true
  }

  return {
    ...streakInfo,
    loading,
    updateStreak,
    useGraceDay,
    refresh: calculateStreak,
  }
}
