'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getFromCache, setCache, getCacheKey } from '@/lib/cache'
import type { UserProfileFact, UserProfileFactInsert, ProfileCategory } from '@/lib/supabase/types'

export function useProfileFacts(userId: string | undefined) {
  const [facts, setFacts] = useState<UserProfileFact[]>([])
  const [loading, setLoading] = useState(true)
  const initializedRef = useRef(false)
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  // Fetch all active facts for the user
  const fetchFacts = useCallback(async () => {
    console.log('[DEBUG] fetchFacts called', { userId })

    if (!userId) {
      console.log('[DEBUG] fetchFacts: No userId, skipping')
      setLoading(false)
      return
    }

    // Try cache first for instant display
    const cacheKey = getCacheKey(userId, 'facts')
    const cached = getFromCache<UserProfileFact[]>(cacheKey)
    if (cached && !initializedRef.current) {
      console.log('[DEBUG] fetchFacts: Using cached facts:', cached.length)
      setFacts(cached)
      setLoading(false)
      initializedRef.current = true
    }

    // Always fetch fresh in background
    console.log('[DEBUG] fetchFacts: Fetching from database...')
    const { data, error } = await client
      .from('user_profile_facts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('category')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[DEBUG] fetchFacts error:', error)
      console.error('[DEBUG] fetchFacts error details:', JSON.stringify(error, null, 2))
    }

    const freshFacts = (data as UserProfileFact[]) || []
    console.log('[DEBUG] fetchFacts: Got', freshFacts.length, 'facts from database')
    setFacts(freshFacts)
    setCache(cacheKey, freshFacts)
    setLoading(false)
    initializedRef.current = true
  }, [userId, client])

  useEffect(() => {
    console.log('[DEBUG] useProfileFacts useEffect triggered, calling fetchFacts')
    fetchFacts()
  }, [fetchFacts])

  // Add a new fact (with optimistic update)
  const addFact = async (category: ProfileCategory, fact: string): Promise<UserProfileFact | null> => {
    console.log('[DEBUG] addFact called', { category, factLength: fact.length, userId })

    if (!userId) {
      console.error('[DEBUG] addFact: No userId!')
      throw new Error('No user')
    }

    // Optimistic update - show immediately
    const tempId = `temp-${Date.now()}`
    const optimisticFact: UserProfileFact = {
      id: tempId,
      user_id: userId,
      category,
      fact,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true,
    }
    setFacts(prev => [optimisticFact, ...prev])

    const newFact: UserProfileFactInsert = {
      user_id: userId,
      category,
      fact,
    }

    console.log('[DEBUG] addFact: Inserting to database...')
    const { data, error } = await client
      .from('user_profile_facts')
      .insert(newFact)
      .select()
      .single()

    console.log('[DEBUG] addFact result:', { data: !!data, error })

    if (error) {
      console.error('[DEBUG] addFact error:', error)
      console.error('[DEBUG] addFact error details:', JSON.stringify(error, null, 2))
      // Rollback on error
      setFacts(prev => prev.filter(f => f.id !== tempId))
      throw error
    }

    const insertedFact = data as UserProfileFact
    console.log('[DEBUG] addFact: Fact saved successfully:', insertedFact.id)
    // Replace temp with real
    setFacts(prev => {
      const updated = prev.map(f => f.id === tempId ? insertedFact : f)
      setCache(getCacheKey(userId, 'facts'), updated)
      return updated
    })
    return insertedFact
  }

  // Update a fact
  const updateFact = async (factId: string, fact: string): Promise<void> => {
    if (!userId) throw new Error('No user')

    const { error } = await client
      .from('user_profile_facts')
      .update({ fact, updated_at: new Date().toISOString() })
      .eq('id', factId)
      .eq('user_id', userId)

    if (error) throw error

    setFacts(prev => prev.map(f =>
      f.id === factId ? { ...f, fact, updated_at: new Date().toISOString() } : f
    ))
  }

  // Deactivate a fact (soft delete with optimistic update)
  const removeFact = async (factId: string): Promise<void> => {
    if (!userId) throw new Error('No user')

    // Optimistic update - remove immediately
    const removedFact = facts.find(f => f.id === factId)
    setFacts(prev => {
      const updated = prev.filter(f => f.id !== factId)
      setCache(getCacheKey(userId, 'facts'), updated)
      return updated
    })

    const { error } = await client
      .from('user_profile_facts')
      .update({ is_active: false })
      .eq('id', factId)
      .eq('user_id', userId)

    if (error) {
      // Rollback on error
      if (removedFact) {
        setFacts(prev => [removedFact, ...prev])
      }
      throw error
    }
  }

  // Get facts by category
  const getFactsByCategory = (category: ProfileCategory): UserProfileFact[] => {
    return facts.filter(f => f.category === category)
  }

  // Get a summary of all facts for AI context
  const getProfileSummary = (): string => {
    if (facts.length === 0) return ''

    const categories: ProfileCategory[] = ['background', 'skills', 'situation', 'goals', 'preferences', 'constraints']
    const categoryLabels: Record<ProfileCategory, string> = {
      background: 'Background',
      skills: 'Skills & Experience',
      situation: 'Current Situation',
      goals: 'Goals',
      preferences: 'Preferences',
      constraints: 'Constraints',
    }

    const sections = categories
      .map(cat => {
        const catFacts = getFactsByCategory(cat)
        if (catFacts.length === 0) return null
        return `**${categoryLabels[cat]}:**\n${catFacts.map(f => `- ${f.fact}`).join('\n')}`
      })
      .filter(Boolean)

    return sections.join('\n\n')
  }

  return {
    facts,
    loading,
    addFact,
    updateFact,
    removeFact,
    getFactsByCategory,
    getProfileSummary,
    refresh: fetchFacts,
  }
}
