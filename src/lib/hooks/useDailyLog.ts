'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { DailyLog, DailyLogInsert } from '@/lib/supabase/types'
import { calculateMorningXp } from '@/lib/gamification/xp-values'

export function useDailyLog(userId: string | undefined) {
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null)
  const [recentLogs, setRecentLogs] = useState<DailyLog[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  const today = format(new Date(), 'yyyy-MM-dd')

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
  }, [userId, today, client])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

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

  // Update checklist items
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

    const { data, error } = await client
      .from('daily_logs')
      .update({
        [field]: value,
        xp_earned: todayLog.xp_earned + xpDelta,
      })
      .eq('id', todayLog.id)
      .select()
      .single()

    if (error) throw error

    // Update user's total XP
    if (value) {
      await client.rpc('increment_xp', { user_id: userId, xp_amount: xpValues[field] })
    }

    setTodayLog(data as DailyLog)
    return value ? xpValues[field] : 0
  }

  // Update mood and energy
  const updateMoodEnergy = async (
    morningEnergy: number,
    morningMood: number
  ): Promise<number> => {
    if (!userId || !todayLog) throw new Error('No log')

    // Check if already submitted
    if (todayLog.morning_energy !== null && todayLog.morning_mood !== null) {
      // Just update values, no XP
      const { data, error } = await client
        .from('daily_logs')
        .update({ morning_energy: morningEnergy, morning_mood: morningMood })
        .eq('id', todayLog.id)
        .select()
        .single()

      if (error) throw error
      setTodayLog(data as DailyLog)
      return 0
    }

    // First submission - award XP
    const xpBonus = 20
    const currentXp = todayLog.xp_earned || 0

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

    // Try to update profile XP, but don't fail if RPC doesn't exist
    try {
      await client.rpc('increment_xp', { user_id: userId, xp_amount: xpBonus })
    } catch (rpcError) {
      console.warn('Could not update profile XP via RPC:', rpcError)
    }

    setTodayLog(data as DailyLog)
    return xpBonus
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
