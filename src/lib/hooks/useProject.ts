'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Project, Milestone, ProjectInsert, ProjectUpdate, MilestoneInsert, MilestoneUpdate } from '@/lib/supabase/types'

export function useProjects(userId: string | undefined, initialProjects?: Project[]) {
  const [projects, setProjects] = useState<Project[]>(initialProjects || [])
  const [loading, setLoading] = useState(!initialProjects)
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  const fetchProjects = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    // Don't show loading if we have initial data
    if (!initialProjects) {
      setLoading(true)
    }

    const { data, error } = await client
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching projects:', error)
    }

    setProjects((data as Project[]) || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]) // Intentionally omit client - it's stable

  useEffect(() => {
    // Always fetch fresh data, but don't block render if we have initial data
    fetchProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]) // Fetch when userId changes

  const createProject = async (project: Omit<ProjectInsert, 'user_id'>): Promise<Project | null> => {
    if (!userId) return null

    const { data, error } = await client
      .from('projects')
      .insert({ ...project, user_id: userId })
      .select()
      .single()

    if (error) {
      console.error('Error creating project:', error)
      return null
    }

    setProjects(prev => [data as Project, ...prev])
    return data as Project
  }

  const updateProject = async (projectId: string, updates: ProjectUpdate): Promise<Project | null> => {
    const { data, error } = await client
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .single()

    if (error) {
      console.error('Error updating project:', error)
      return null
    }

    setProjects(prev =>
      prev.map(p => (p.id === projectId ? (data as Project) : p))
    )
    return data as Project
  }

  const deleteProject = async (projectId: string): Promise<boolean> => {
    const { error } = await client
      .from('projects')
      .delete()
      .eq('id', projectId)

    if (error) {
      console.error('Error deleting project:', error)
      return false
    }

    setProjects(prev => prev.filter(p => p.id !== projectId))
    return true
  }

  return {
    projects,
    loading,
    createProject,
    updateProject,
    deleteProject,
    refresh: fetchProjects,
  }
}

export function useProject(
  projectId: string | undefined,
  userId: string | undefined,
  initialProject?: Project | null,
  initialMilestones?: Milestone[]
) {
  const [project, setProject] = useState<Project | null>(initialProject || null)
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones || [])
  const [loading, setLoading] = useState(!initialProject)
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  const fetchProject = useCallback(async () => {
    if (!projectId || !userId) {
      setLoading(false)
      return
    }

    // Don't show loading if we have initial data
    if (!initialProject) {
      setLoading(true)
    }

    // Fetch project
    const { data: projectData, error: projectError } = await client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single()

    if (projectError) {
      console.error('Error fetching project:', projectError)
      setLoading(false)
      return
    }

    setProject(projectData as Project)

    // Fetch milestones
    const { data: milestoneData, error: milestoneError } = await client
      .from('milestones')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })

    if (milestoneError) {
      console.error('Error fetching milestones:', milestoneError)
    }

    setMilestones((milestoneData as Milestone[]) || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId]) // Intentionally omit client - it's stable

  useEffect(() => {
    // Always fetch fresh data in background
    fetchProject()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId]) // Fetch when projectId or userId changes

  const updateProject = async (updates: ProjectUpdate): Promise<Project | null> => {
    if (!projectId) return null

    const { data, error } = await client
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .single()

    if (error) {
      console.error('Error updating project:', error)
      return null
    }

    setProject(data as Project)
    return data as Project
  }

  const addMilestone = async (milestone: Omit<MilestoneInsert, 'project_id' | 'user_id'>): Promise<Milestone | null> => {
    if (!projectId || !userId) return null

    const sortOrder = milestones.length

    const { data, error } = await client
      .from('milestones')
      .insert({
        ...milestone,
        project_id: projectId,
        user_id: userId,
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding milestone:', error)
      return null
    }

    setMilestones(prev => [...prev, data as Milestone])
    return data as Milestone
  }

  const updateMilestone = async (milestoneId: string, updates: MilestoneUpdate): Promise<Milestone | null> => {
    const { data, error } = await client
      .from('milestones')
      .update(updates)
      .eq('id', milestoneId)
      .select()
      .single()

    if (error) {
      console.error('Error updating milestone:', error)
      return null
    }

    setMilestones(prev =>
      prev.map(m => (m.id === milestoneId ? (data as Milestone) : m))
    )

    // Refetch project to get updated progress
    await fetchProject()

    return data as Milestone
  }

  const completeMilestone = async (milestoneId: string): Promise<number> => {
    if (!userId) return 0

    const milestone = milestones.find(m => m.id === milestoneId)
    if (!milestone || milestone.status === 'completed') return 0

    const { error } = await client
      .from('milestones')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', milestoneId)

    if (error) {
      console.error('Error completing milestone:', error)
      return 0
    }

    // Award XP
    await client.rpc('increment_xp', { user_id: userId, xp_amount: milestone.xp_reward })

    // Refresh data
    await fetchProject()

    return milestone.xp_reward
  }

  const deleteMilestone = async (milestoneId: string): Promise<boolean> => {
    const { error } = await client
      .from('milestones')
      .delete()
      .eq('id', milestoneId)

    if (error) {
      console.error('Error deleting milestone:', error)
      return false
    }

    setMilestones(prev => prev.filter(m => m.id !== milestoneId))
    return true
  }

  const reorderMilestones = async (orderedIds: string[]): Promise<boolean> => {
    const updates = orderedIds.map((id, index) => ({
      id,
      sort_order: index,
    }))

    for (const update of updates) {
      const { error } = await client
        .from('milestones')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id)

      if (error) {
        console.error('Error reordering milestones:', error)
        return false
      }
    }

    setMilestones(prev =>
      [...prev].sort((a, b) => {
        const aIndex = orderedIds.indexOf(a.id)
        const bIndex = orderedIds.indexOf(b.id)
        return aIndex - bIndex
      })
    )

    return true
  }

  const deleteProject = async (): Promise<boolean> => {
    if (!projectId) return false

    const { error } = await client
      .from('projects')
      .delete()
      .eq('id', projectId)

    if (error) {
      console.error('Error deleting project:', error)
      return false
    }

    setProject(null)
    return true
  }

  return {
    project,
    milestones,
    loading,
    updateProject,
    deleteProject,
    addMilestone,
    updateMilestone,
    completeMilestone,
    deleteMilestone,
    reorderMilestones,
    refresh: fetchProject,
  }
}
