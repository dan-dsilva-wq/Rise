'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getFromCache, setCache, getCacheKey } from '@/lib/cache'
import type { UserProfileFact, UserProfileFactInsert, ProfileCategory } from '@/lib/supabase/types'
import {
  areNearDuplicateMemories,
  isLikelyRelevantProfileFact,
  memorySignature,
  normalizeMemoryText,
} from '@/lib/memory/relevance'

// Helper to get client - only call after mount (client-side)
function getClient() {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any
}

function sanitizeAndDedupeFacts(facts: UserProfileFact[]): { kept: UserProfileFact[]; dropIds: string[] } {
  const kept: UserProfileFact[] = []
  const dropIds: string[] = []
  const seenBySignature = new Map<string, UserProfileFact>()

  const sorted = [...facts].sort((a, b) => b.created_at.localeCompare(a.created_at))
  for (const fact of sorted) {
    const cleaned = normalizeMemoryText(fact.fact)
    if (!isLikelyRelevantProfileFact(cleaned)) {
      dropIds.push(fact.id)
      continue
    }

    const signature = memorySignature(cleaned)
    const existing = seenBySignature.get(signature)
    if (existing && areNearDuplicateMemories(existing.fact, cleaned)) {
      dropIds.push(fact.id)
      continue
    }

    const nextFact = { ...fact, fact: cleaned }
    kept.push(nextFact)
    seenBySignature.set(signature, nextFact)
  }

  return { kept, dropIds }
}

export function useProfileFacts(userId: string | undefined) {
  const [facts, setFacts] = useState<UserProfileFact[]>([])
  const [loading, setLoading] = useState(true)
  const initializedRef = useRef(false)

  // Fetch all active facts for the user
  const fetchFacts = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    // Try cache first for instant display
    const cacheKey = getCacheKey(userId, 'facts')
    const cached = getFromCache<UserProfileFact[]>(cacheKey)
    if (cached && !initializedRef.current) {
      const sanitizedCached = sanitizeAndDedupeFacts(cached).kept
      setFacts(sanitizedCached)
      setLoading(false)
      initializedRef.current = true
    }

    // Always fetch fresh in background
    const client = getClient()
    const { data, error } = await client
      .from('user_profile_facts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('category')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('fetchFacts error:', error)
    }

    const freshFacts = (data as UserProfileFact[]) || []
    const { kept, dropIds } = sanitizeAndDedupeFacts(freshFacts)
    setFacts(kept)
    setCache(cacheKey, kept)

    if (dropIds.length > 0) {
      client
        .from('user_profile_facts')
        .update({ is_active: false })
        .in('id', dropIds)
        .eq('user_id', userId)
        .then(() => null)
        .catch(() => null)
    }

    setLoading(false)
    initializedRef.current = true
  }, [userId])

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchFacts()
    }, 0)

    return () => clearTimeout(timeout)
  }, [fetchFacts])

  // Add a new fact (with optimistic update)
  const addFact = async (category: ProfileCategory, fact: string): Promise<UserProfileFact | null> => {
    if (!userId) {
      throw new Error('No user')
    }

    const cleanedFact = normalizeMemoryText(fact)
    if (!isLikelyRelevantProfileFact(cleanedFact)) {
      return null
    }

    const duplicate = facts.find(existing => areNearDuplicateMemories(existing.fact, cleanedFact))
    if (duplicate) {
      return duplicate
    }

    // Optimistic update - show immediately
    const tempId = `temp-${Date.now()}`
    const optimisticFact: UserProfileFact = {
      id: tempId,
      user_id: userId,
      category,
      fact: cleanedFact,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true,
    }
    setFacts(prev => [optimisticFact, ...prev])

    const newFact: UserProfileFactInsert = {
      user_id: userId,
      category,
      fact: cleanedFact,
    }

    const client = getClient()
    const { data, error } = await client
      .from('user_profile_facts')
      .insert(newFact)
      .select()
      .single()

    if (error) {
      // Rollback on error
      setFacts(prev => prev.filter(f => f.id !== tempId))
      throw error
    }

    const insertedFact = data as UserProfileFact
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
    const cleanedFact = normalizeMemoryText(fact)
    if (!isLikelyRelevantProfileFact(cleanedFact)) {
      throw new Error('Fact is too vague to remember')
    }

    const duplicate = facts.find(existing =>
      existing.id !== factId && areNearDuplicateMemories(existing.fact, cleanedFact)
    )
    if (duplicate) {
      throw new Error('Fact already remembered')
    }

    const client = getClient()
    const { error } = await client
      .from('user_profile_facts')
      .update({ fact: cleanedFact, updated_at: new Date().toISOString() })
      .eq('id', factId)
      .eq('user_id', userId)

    if (error) throw error

    setFacts(prev => prev.map(f =>
      f.id === factId ? { ...f, fact: cleanedFact, updated_at: new Date().toISOString() } : f
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

    const client = getClient()
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
