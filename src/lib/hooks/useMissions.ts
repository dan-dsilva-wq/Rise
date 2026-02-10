'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DailyMission, DailyMissionInsert, Project, Milestone } from '@/lib/supabase/types'

// Use UTC date to match server-side (Vercel runs in UTC)
function getUtcDateString(): string {
  return new Date().toISOString().split('T')[0]
}

export function useMissions(userId: string | undefined) {
  const [todayMissions, setTodayMissions] = useState<DailyMission[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  const today = getUtcDateString()

  const fetchMissions = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    setLoading(true)

    // Get today's missions
    const { data, error } = await client
      .from('daily_missions')
      .select('*, projects(*), milestones(*)')
      .eq('user_id', userId)
      .eq('mission_date', today)
      .order('priority', { ascending: true })

    if (error) {
      console.error('Error fetching missions:', error)
    }

    setTodayMissions((data as DailyMission[]) || [])
    setLoading(false)
  }, [userId, today, client])

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchMissions()
    }, 0)

    return () => clearTimeout(timeout)
  }, [fetchMissions])

  // Generate missions for today based on active projects
  const generateMissions = useCallback(async () => {
    if (!userId) return

    // Check if missions already exist for today
    const { data: existingMissions } = await client
      .from('daily_missions')
      .select('id')
      .eq('user_id', userId)
      .eq('mission_date', today)

    if (existingMissions && existingMissions.length > 0) {
      // Missions already generated for today
      return
    }

    // Get active projects with their in-progress milestones
    const { data: projects } = await client
      .from('projects')
      .select('*, milestones(*)')
      .eq('user_id', userId)
      .in('status', ['building', 'planning'])
      .order('updated_at', { ascending: false })

    if (!projects || projects.length === 0) {
      return
    }

    const missions: DailyMissionInsert[] = []

    // Generate missions from active milestones
    for (const project of projects as (Project & { milestones: Milestone[] })[]) {
      // Find the first in-progress or pending milestone
      const activeMilestone = project.milestones?.find(
        (m: Milestone) => m.status === 'in_progress' || m.status === 'pending'
      )

      if (activeMilestone) {
        missions.push({
          user_id: userId,
          project_id: project.id,
          milestone_id: activeMilestone.id,
          title: `Work on: ${activeMilestone.title}`,
          description: activeMilestone.description || `Part of ${project.name}`,
          mission_date: today,
          priority: missions.length + 1,
        })
      }
    }

    // Add a default mission if no project missions
    if (missions.length === 0) {
      missions.push({
        user_id: userId,
        title: 'Define your next step',
        description: 'Use the Path Finder to discover what to build',
        mission_date: today,
        priority: 1,
      })
    }

    // Insert missions
    const { error } = await client.from('daily_missions').insert(missions)

    if (error) {
      console.error('Error generating missions:', error)
      return
    }

    // Refresh missions
    await fetchMissions()
  }, [userId, today, client, fetchMissions])

  // Complete a mission
  const completeMission = async (missionId: string): Promise<void> => {
    if (!userId) return

    const { error } = await client
      .from('daily_missions')
      .update({ status: 'completed' })
      .eq('id', missionId)

    if (error) {
      console.error('Error completing mission:', error)
      return
    }

    await fetchMissions()
  }

  // Skip a mission
  const skipMission = async (missionId: string): Promise<boolean> => {
    const { error } = await client
      .from('daily_missions')
      .update({ status: 'skipped' })
      .eq('id', missionId)

    if (error) {
      console.error('Error skipping mission:', error)
      return false
    }

    setTodayMissions(prev =>
      prev.map(m => (m.id === missionId ? { ...m, status: 'skipped' as const } : m))
    )

    return true
  }

  // Create a custom mission
  const createMission = async (mission: Omit<DailyMissionInsert, 'user_id' | 'mission_date'>): Promise<DailyMission | null> => {
    if (!userId) return null

    const { data, error } = await client
      .from('daily_missions')
      .insert({
        ...mission,
        user_id: userId,
        mission_date: today,
        priority: todayMissions.length + 1,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating mission:', error)
      return null
    }

    setTodayMissions(prev => [...prev, data as DailyMission])
    return data as DailyMission
  }

  // Get primary (first incomplete) mission
  const primaryMission = todayMissions.find(m => m.status === 'pending' || m.status === 'in_progress')

  // Stats
  const completedCount = todayMissions.filter(m => m.status === 'completed').length
  const totalCount = todayMissions.length

  return {
    todayMissions,
    primaryMission,
    loading,
    completedCount,
    totalCount,
    generateMissions,
    completeMission,
    skipMission,
    createMission,
    refresh: fetchMissions,
  }
}
