'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PathFinderProgress } from '@/lib/supabase/types'
import { getNode } from '@/lib/path-finder/tree-data'

export function usePathFinder(userId: string | undefined) {
  const [progress, setProgress] = useState<PathFinderProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  // Fetch user's path finder progress
  const fetchProgress = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    setLoading(true)

    const { data, error } = await client
      .from('path_finder_progress')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (not an error, just no progress yet)
      console.error('Error fetching path finder progress:', error)
    }

    setProgress(data as PathFinderProgress | null)
    setLoading(false)
  }, [userId, client])

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchProgress()
    }, 0)

    return () => clearTimeout(timeout)
  }, [fetchProgress])

  // Navigate to a new node
  const navigate = useCallback(async (nodeId: string, visitedNodes: string[]) => {
    if (!userId) return

    const node = getNode(nodeId)
    if (!node) return

    if (progress) {
      // Update existing progress
      const { data, error } = await client
        .from('path_finder_progress')
        .update({
          current_node_id: nodeId,
          visited_nodes: visitedNodes,
        })
        .eq('user_id', userId)
        .select()
        .single()

      if (error) {
        console.error('Error updating path finder progress:', error)
        return
      }

      setProgress(data as PathFinderProgress)
    } else {
      // Create new progress
      const { data, error } = await client
        .from('path_finder_progress')
        .insert({
          user_id: userId,
          current_node_id: nodeId,
          visited_nodes: visitedNodes,
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating path finder progress:', error)
        return
      }

      setProgress(data as PathFinderProgress)
    }
  }, [userId, progress, client])

  // Select a final path (suggestion node)
  const selectPath = useCallback(async (pathNodeId: string) => {
    if (!userId || !progress) return

    const { data, error } = await client
      .from('path_finder_progress')
      .update({
        selected_path: pathNodeId || null,
      })
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('Error selecting path:', error)
      return
    }

    setProgress(data as PathFinderProgress)
  }, [userId, progress, client])

  // Reset progress to start
  const reset = useCallback(async () => {
    if (!userId) return

    if (progress) {
      const { data, error } = await client
        .from('path_finder_progress')
        .update({
          current_node_id: 'start',
          visited_nodes: [],
          selected_path: null,
        })
        .eq('user_id', userId)
        .select()
        .single()

      if (error) {
        console.error('Error resetting path finder:', error)
        return
      }

      setProgress(data as PathFinderProgress)
    }
  }, [userId, progress, client])

  // Get current state for TreeView
  const currentNodeId = progress?.current_node_id || 'start'
  const visitedNodes = progress?.visited_nodes || []
  const selectedPath = progress?.selected_path || null

  return {
    progress,
    loading,
    currentNodeId,
    visitedNodes,
    selectedPath,
    navigate,
    selectPath,
    reset,
    refresh: fetchProgress,
  }
}
