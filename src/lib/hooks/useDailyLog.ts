'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DailyLog, DailyLogInsert } from '@/lib/supabase/types'
import { calculateMorningXp } from '@/lib/gamification/xp-values'

// Use UTC date to match server-side (Vercel runs in UTC)
function getUtcDateString(): string {
  return new Date().toISOString().split('T')[0]
}

export function useDailyLog(userId: string | undefined, initialLog?: DailyLog | null) {
  const [todayLog, setTodayLog] = useState<DailyLog | null>(initialLog || null)
  const [recentLogs, setRecentLogs] = useState<DailyLog[]>([])
  const [loading, setLoading] = useState(!initialLog)
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  const today = getUtcDateString()

  // Fetch today's log and recent logs
  const fetchLogs = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    setLoading(true)

    // Get today's log
    const { data: todayData } = await client
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('log_date', today)
      .single()

    setTodayLog(todayData as DailyLog | null)

    // Get recent logs (last 30 days)
    const { data: recentData } = await client
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(30)

    setRecentLogs((recentData as DailyLog[]) || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, today]) // Intentionally omit client - it's stable

  useEffect(() => {
    // Only fetch if we don't have initial data
    if (!initialLog) {
      fetchLogs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount only

  // Create or update today's log when "I'm Up" is pressed
  const pressImUp = async (): Promise<{ xpEarned: number; isNewDay: boolean }> => {
    if (!userId) throw new Error('No user')

    const now = new Date().toISOString()
    const isEarly = new Date().getHours() < 7

    if (todayLog) {
      // Already pressed today
      return { xpEarned: 0, isNewDay: false }
    }

    // Calculate XP
    const xpEarned = calculateMorningXp({
      imUp: true,
      isEarly,
    })

    // Create new log
    const newLog: DailyLogInsert = {
      user_id: userId,
      log_date: today,
      im_up_pressed_at: now,
      wake_time: now,
      xp_earned: xpEarned,
    }

    const { data, error } = await client
      .from('daily_logs')
      .insert(newLog)
      .select()
      .single()

    if (error) throw error

    // Update user's total XP
    await client.rpc('increment_xp', { user_id: userId, xp_amount: xpEarned })

    setTodayLog(data as DailyLog)
    return { xpEarned, isNewDay: true }
  }

  // Update checklist items (with optimistic UI)
  const updateChecklist = async (
    field: 'feet_on_floor' | 'light_exposure' | 'drank_water',
    value: boolean
  ): Promise<number> => {
    if (!userId || !todayLog) throw new Error('No log')

    const xpValues = {
      feet_on_floor: 10,
      light_exposure: 15,
      drank_water: 10,
    }

    const xpDelta = value ? xpValues[field] : -xpValues[field]
    const newXp = todayLog.xp_earned + xpDelta

    // Optimistic update - show immediately and keep it
    const previousLog = todayLog
    const optimisticLog = {
      ...todayLog,
      [field]: value,
      xp_earned: newXp,
    }
    setTodayLog(optimisticLog)

    try {
      const { error } = await client
        .from('daily_logs')
        .update({
          [field]: value,
          xp_earned: newXp,
        })
        .eq('id', todayLog.id)

      if (error) throw error

      // Update user's total XP in background (don't await)
      if (value) {
        client.rpc('increment_xp', { user_id: userId, xp_amount: xpValues[field] }).catch(() => {})
      }

      // Don't re-set state - optimistic update is already correct
      return value ? xpValues[field] : 0
    } catch (error) {
      // Rollback on error
      setTodayLog(previousLog)
      throw error
    }
  }

  // Update mood and energy (with optimistic UI)
  const updateMoodEnergy = async (
    morningEnergy: number,
    morningMood: number
  ): Promise<number> => {
    if (!userId || !todayLog) {
      console.error('Cannot save mood: no user or todayLog', { userId, hasTodayLog: !!todayLog })
      throw new Error('Please press "I\'m Up" first to start your day')
    }

    const isFirstSubmission = todayLog.morning_energy === null && todayLog.morning_mood === null
    const xpBonus = isFirstSubmission ? 20 : 0
    const currentXp = todayLog.xp_earned || 0

    // Optimistic update - show immediately
    const previousLog = todayLog
    setTodayLog({
      ...todayLog,
      morning_energy: morningEnergy,
      morning_mood: morningMood,
      xp_earned: currentXp + xpBonus,
    })

    try {
      const { data, error } = await client
        .from('daily_logs')
        .update({
          morning_energy: morningEnergy,
          morning_mood: morningMood,
          xp_earned: currentXp + xpBonus,
        })
        .eq('id', todayLog.id)
        .select()
        .single()

      if (error) {
        console.error('Failed to update daily_logs:', error)
        throw error
      }

      // Try to update profile XP in background
      if (isFirstSubmission) {
        client.rpc('increment_xp', { user_id: userId, xp_amount: xpBonus }).catch(() => {})
      }

      setTodayLog(data as DailyLog)
      return xpBonus
    } catch (error) {
      // Rollback on error
      setTodayLog(previousLog)
      throw error
    }
  }

  // Get a random daily prompt
  const getDailyPrompt = async () => {
    const { data } = await client
      .from('daily_prompts')
      .select('*')
      .eq('is_active', true)

    if (!data || data.length === 0) {
      return {
        prompt_text: 'Today is a new opportunity.',
        author: null,
      }
    }

    // Use date as seed for consistent prompt per day
    const dayIndex = new Date().getDate() % data.length
    return data[dayIndex]
  }

  return {
    todayLog,
    recentLogs,
    loading,
    pressImUp,
    updateChecklist,
    updateMoodEnergy,
    getDailyPrompt,
    refresh: fetchLogs,
  }
}
