'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DailyLog, DailyLogInsert } from '@/lib/supabase/types'

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
  const pressImUp = async (): Promise<{ isNewDay: boolean }> => {
    if (!userId) throw new Error('No user')

    const now = new Date().toISOString()

    if (todayLog) {
      // Already pressed today
      return { isNewDay: false }
    }

    // Create new log
    const newLog: DailyLogInsert = {
      user_id: userId,
      log_date: today,
      im_up_pressed_at: now,
      wake_time: now,
    }

    const { data, error } = await client
      .from('daily_logs')
      .insert(newLog)
      .select()
      .single()

    if (error) throw error

    setTodayLog(data as DailyLog)
    return { isNewDay: true }
  }

  // Update checklist items (with optimistic UI)
  const updateChecklist = async (
    field: 'feet_on_floor' | 'light_exposure' | 'drank_water',
    value: boolean
  ): Promise<void> => {
    if (!userId || !todayLog) throw new Error('No log')

    // Optimistic update - show immediately and keep it
    const previousLog = todayLog
    const optimisticLog = {
      ...todayLog,
      [field]: value,
    }
    setTodayLog(optimisticLog)

    try {
      const { error } = await client
        .from('daily_logs')
        .update({
          [field]: value,
        })
        .eq('id', todayLog.id)

      if (error) throw error
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
  ): Promise<void> => {
    if (!userId || !todayLog) {
      console.error('Cannot save mood: no user or todayLog', { userId, hasTodayLog: !!todayLog })
      throw new Error('Please press "I\'m Up" first to start your day')
    }

    // Optimistic update - show immediately
    const previousLog = todayLog
    setTodayLog({
      ...todayLog,
      morning_energy: morningEnergy,
      morning_mood: morningMood,
    })

    try {
      const { data, error } = await client
        .from('daily_logs')
        .update({
          morning_energy: morningEnergy,
          morning_mood: morningMood,
        })
        .eq('id', todayLog.id)
        .select()
        .single()

      if (error) {
        console.error('Failed to update daily_logs:', error)
        throw error
      }

      setTodayLog(data as DailyLog)
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
