'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getFromCache, setCache, getCacheKey } from '@/lib/cache'
import type {
  ProjectContext,
  ProjectContextInsert,
  AiInsight,
  AiInsightInsert,
  UserProfileFact,
  ProjectContextType,
  InsightType,
  SourceAi
} from '@/lib/supabase/types'

// Helper to get client - only call after mount (client-side)
function getClient() {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any
}

interface UseAiContextOptions {
  projectId?: string
  milestoneId?: string
}

interface FormattedContext {
  profileSummary: string
  projectContext: string
  insights: string
  fullContext: string  // Combined formatted string for AI system prompts
}

export function useAiContext(userId: string | undefined, options: UseAiContextOptions = {}) {
  const { projectId, milestoneId } = options

  const [projectContexts, setProjectContexts] = useState<ProjectContext[]>([])
  const [insights, setInsights] = useState<AiInsight[]>([])
  const [profileFacts, setProfileFacts] = useState<UserProfileFact[]>([])
  const [loading, setLoading] = useState(true)
  const initializedRef = useRef(false)

  // Fetch all context data
  const fetchContext = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    const client = getClient()

    // Try cache first
    const contextCacheKey = getCacheKey(userId, `ai_context_${projectId || 'global'}`)
    const cached = getFromCache<{
      projectContexts: ProjectContext[]
      insights: AiInsight[]
      profileFacts: UserProfileFact[]
    }>(contextCacheKey)

    if (cached && !initializedRef.current) {
      setProjectContexts(cached.projectContexts)
      setInsights(cached.insights)
      setProfileFacts(cached.profileFacts)
      setLoading(false)
      initializedRef.current = true
    }

    // Fetch fresh data in parallel
    const [contextResult, insightsResult, factsResult] = await Promise.all([
      // Project context (if projectId provided)
      projectId
        ? client
            .from('project_context')
            .select('*')
            .eq('project_id', projectId)
            .eq('user_id', userId)
        : Promise.resolve({ data: [], error: null }),

      // AI insights (filter by project/milestone if provided)
      (async () => {
        let query = client
          .from('ai_insights')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('importance', { ascending: false })
          .order('created_at', { ascending: false })

        if (projectId) {
          // Get project-specific + global insights
          query = query.or(`project_id.eq.${projectId},project_id.is.null`)
        }

        if (milestoneId) {
          query = query.or(`milestone_id.eq.${milestoneId},milestone_id.is.null`)
        }

        return query.limit(50) // Cap at 50 most relevant insights
      })(),

      // Profile facts
      client
        .from('user_profile_facts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('category')
    ])

    if (contextResult.error) console.error('Error fetching project context:', contextResult.error)
    if (insightsResult.error) console.error('Error fetching insights:', insightsResult.error)
    if (factsResult.error) console.error('Error fetching profile facts:', factsResult.error)

    const freshProjectContexts = (contextResult.data as ProjectContext[]) || []
    const freshInsights = (insightsResult.data as AiInsight[]) || []
    const freshProfileFacts = (factsResult.data as UserProfileFact[]) || []

    setProjectContexts(freshProjectContexts)
    setInsights(freshInsights)
    setProfileFacts(freshProfileFacts)

    setCache(contextCacheKey, {
      projectContexts: freshProjectContexts,
      insights: freshInsights,
      profileFacts: freshProfileFacts,
    })

    setLoading(false)
    initializedRef.current = true
  }, [userId, projectId, milestoneId])

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchContext()
    }, 0)
    return () => clearTimeout(timeout)
  }, [fetchContext])

  // Add project context
  const addProjectContext = async (
    targetProjectId: string,
    contextType: ProjectContextType,
    key: string,
    value: string,
    confidence: number = 1.0,
    source: SourceAi
  ): Promise<ProjectContext | null> => {
    if (!userId) throw new Error('No user')

    const newContext: ProjectContextInsert = {
      project_id: targetProjectId,
      user_id: userId,
      context_type: contextType,
      key,
      value,
      confidence,
      source,
    }

    const client = getClient()
    const { data, error } = await client
      .from('project_context')
      .upsert(newContext, {
        onConflict: 'project_id,context_type,key',
        ignoreDuplicates: false
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding project context:', error)
      return null
    }

    const insertedContext = data as ProjectContext
    setProjectContexts(prev => {
      // Replace if exists, otherwise add
      const existing = prev.findIndex(
        c => c.project_id === targetProjectId && c.context_type === contextType && c.key === key
      )
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = insertedContext
        return updated
      }
      return [...prev, insertedContext]
    })

    return insertedContext
  }

  // Add AI insight
  const addInsight = async (
    insightType: InsightType,
    content: string,
    sourceAi: SourceAi,
    options: {
      projectId?: string
      milestoneId?: string
      importance?: number
      conversationId?: string
      expiresAt?: string
    } = {}
  ): Promise<AiInsight | null> => {
    if (!userId) throw new Error('No user')

    const newInsight: AiInsightInsert = {
      user_id: userId,
      project_id: options.projectId || null,
      milestone_id: options.milestoneId || null,
      insight_type: insightType,
      content,
      importance: options.importance || 5,
      source_conversation_id: options.conversationId || null,
      source_ai: sourceAi,
      expires_at: options.expiresAt || null,
    }

    const client = getClient()
    const { data, error } = await client
      .from('ai_insights')
      .insert(newInsight)
      .select()
      .single()

    if (error) {
      console.error('Error adding insight:', error)
      return null
    }

    const insertedInsight = data as AiInsight
    setInsights(prev => [insertedInsight, ...prev])
    return insertedInsight
  }

  // Deactivate an insight
  const deactivateInsight = async (insightId: string): Promise<void> => {
    if (!userId) throw new Error('No user')

    const client = getClient()
    const { error } = await client
      .from('ai_insights')
      .update({ is_active: false })
      .eq('id', insightId)
      .eq('user_id', userId)

    if (error) throw error

    setInsights(prev => prev.filter(i => i.id !== insightId))
  }

  // Format profile facts for AI consumption
  const formatProfileSummary = (): string => {
    if (profileFacts.length === 0) return ''

    const categories = ['background', 'skills', 'situation', 'goals', 'preferences', 'constraints'] as const
    const categoryLabels: Record<typeof categories[number], string> = {
      background: 'Background',
      skills: 'Skills & Experience',
      situation: 'Current Situation',
      goals: 'Goals',
      preferences: 'Preferences',
      constraints: 'Constraints',
    }

    const sections = categories
      .map(cat => {
        const catFacts = profileFacts.filter(f => f.category === cat)
        if (catFacts.length === 0) return null
        return `**${categoryLabels[cat]}:**\n${catFacts.map(f => `- ${f.fact}`).join('\n')}`
      })
      .filter(Boolean)

    return sections.join('\n\n')
  }

  // Format project context for AI consumption
  const formatProjectContext = (): string => {
    if (projectContexts.length === 0) return ''

    const groupedByType: Record<string, ProjectContext[]> = {}
    for (const ctx of projectContexts) {
      if (!groupedByType[ctx.context_type]) {
        groupedByType[ctx.context_type] = []
      }
      groupedByType[ctx.context_type].push(ctx)
    }

    const typeLabels: Record<string, string> = {
      tech_stack: 'Tech Stack',
      target_audience: 'Target Audience',
      constraints: 'Constraints',
      decisions: 'Decisions Made',
      requirements: 'Requirements',
    }

    const sections = Object.entries(groupedByType).map(([type, contexts]) => {
      const label = typeLabels[type] || type
      const items = contexts.map(c => {
        const confidenceNote = c.confidence < 1.0 ? ` (inferred, ${Math.round(c.confidence * 100)}% confidence)` : ''
        return `- **${c.key}:** ${c.value}${confidenceNote}`
      })
      return `**${label}:**\n${items.join('\n')}`
    })

    return sections.join('\n\n')
  }

  // Format insights for AI consumption
  const formatInsights = (): string => {
    if (insights.length === 0) return ''

    // Group by type, prioritize by importance
    const highImportance = insights.filter(i => i.importance >= 7)
    const mediumImportance = insights.filter(i => i.importance >= 4 && i.importance < 7)

    const sections: string[] = []

    if (highImportance.length > 0) {
      sections.push(`**Key Insights:**\n${highImportance.map(i => `- [${i.insight_type}] ${i.content}`).join('\n')}`)
    }

    if (mediumImportance.length > 0) {
      sections.push(`**Additional Context:**\n${mediumImportance.map(i => `- [${i.insight_type}] ${i.content}`).join('\n')}`)
    }

    return sections.join('\n\n')
  }

  // Get complete formatted context for AI system prompts
  const getContextForAi = (): FormattedContext => {
    const profileSummary = formatProfileSummary()
    const projectContext = formatProjectContext()
    const insightsText = formatInsights()

    const sections: string[] = []

    if (profileSummary) {
      sections.push(`## User Profile\n${profileSummary}`)
    }

    if (projectContext) {
      sections.push(`## Project Context\n${projectContext}`)
    }

    if (insightsText) {
      sections.push(`## Discovered Insights\n${insightsText}`)
    }

    return {
      profileSummary,
      projectContext,
      insights: insightsText,
      fullContext: sections.join('\n\n'),
    }
  }

  // Get context by type
  const getProjectContextByType = (type: ProjectContextType): ProjectContext[] => {
    return projectContexts.filter(c => c.context_type === type)
  }

  // Get specific context value
  const getContextValue = (type: ProjectContextType, key: string): string | null => {
    const ctx = projectContexts.find(c => c.context_type === type && c.key === key)
    return ctx?.value || null
  }

  // Get insights by type
  const getInsightsByType = (type: InsightType): AiInsight[] => {
    return insights.filter(i => i.insight_type === type)
  }

  return {
    // Data
    projectContexts,
    insights,
    profileFacts,
    loading,

    // Actions
    addProjectContext,
    addInsight,
    deactivateInsight,
    refresh: fetchContext,

    // Formatters
    getContextForAi,
    formatProfileSummary,
    formatProjectContext,
    formatInsights,

    // Getters
    getProjectContextByType,
    getContextValue,
    getInsightsByType,
  }
}

// Server-side helper to fetch context (for API routes)
export async function fetchAiContextForApi(
  client: ReturnType<typeof createClient>,
  userId: string,
  projectId?: string,
  milestoneId?: string
): Promise<FormattedContext> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = client as any

  // Fetch all data in parallel
  const [contextResult, insightsResult, factsResult] = await Promise.all([
    projectId
      ? supabase
          .from('project_context')
          .select('*')
          .eq('project_id', projectId)
          .eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),

    (async () => {
      let query = supabase
        .from('ai_insights')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })

      if (projectId) {
        query = query.or(`project_id.eq.${projectId},project_id.is.null`)
      }

      if (milestoneId) {
        query = query.or(`milestone_id.eq.${milestoneId},milestone_id.is.null`)
      }

      return query.limit(50)
    })(),

    supabase
      .from('user_profile_facts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('category')
  ])

  const projectContexts = (contextResult.data as ProjectContext[]) || []
  const insights = (insightsResult.data as AiInsight[]) || []
  const profileFacts = (factsResult.data as UserProfileFact[]) || []

  // Format profile summary
  const categories = ['background', 'skills', 'situation', 'goals', 'preferences', 'constraints'] as const
  const categoryLabels: Record<typeof categories[number], string> = {
    background: 'Background',
    skills: 'Skills & Experience',
    situation: 'Current Situation',
    goals: 'Goals',
    preferences: 'Preferences',
    constraints: 'Constraints',
  }

  const profileSections = categories
    .map(cat => {
      const catFacts = profileFacts.filter(f => f.category === cat)
      if (catFacts.length === 0) return null
      return `**${categoryLabels[cat]}:**\n${catFacts.map(f => `- ${f.fact}`).join('\n')}`
    })
    .filter(Boolean)
  const profileSummary = profileSections.join('\n\n')

  // Format project context
  const groupedByType: Record<string, ProjectContext[]> = {}
  for (const ctx of projectContexts) {
    if (!groupedByType[ctx.context_type]) {
      groupedByType[ctx.context_type] = []
    }
    groupedByType[ctx.context_type].push(ctx)
  }

  const typeLabels: Record<string, string> = {
    tech_stack: 'Tech Stack',
    target_audience: 'Target Audience',
    constraints: 'Constraints',
    decisions: 'Decisions Made',
    requirements: 'Requirements',
  }

  const contextSections = Object.entries(groupedByType).map(([type, contexts]) => {
    const label = typeLabels[type] || type
    const items = contexts.map(c => {
      const confidenceNote = c.confidence < 1.0 ? ` (inferred, ${Math.round(c.confidence * 100)}% confidence)` : ''
      return `- **${c.key}:** ${c.value}${confidenceNote}`
    })
    return `**${label}:**\n${items.join('\n')}`
  })
  const projectContext = contextSections.join('\n\n')

  // Format insights
  const highImportance = insights.filter(i => i.importance >= 7)
  const mediumImportance = insights.filter(i => i.importance >= 4 && i.importance < 7)
  const insightSections: string[] = []

  if (highImportance.length > 0) {
    insightSections.push(`**Key Insights:**\n${highImportance.map(i => `- [${i.insight_type}] ${i.content}`).join('\n')}`)
  }
  if (mediumImportance.length > 0) {
    insightSections.push(`**Additional Context:**\n${mediumImportance.map(i => `- [${i.insight_type}] ${i.content}`).join('\n')}`)
  }
  const insightsText = insightSections.join('\n\n')

  // Build full context
  const fullSections: string[] = []
  if (profileSummary) fullSections.push(`## User Profile\n${profileSummary}`)
  if (projectContext) fullSections.push(`## Project Context\n${projectContext}`)
  if (insightsText) fullSections.push(`## Discovered Insights\n${insightsText}`)

  return {
    profileSummary,
    projectContext,
    insights: insightsText,
    fullContext: fullSections.join('\n\n'),
  }
}

// Server-side helper to save project context
export async function saveProjectContext(
  client: ReturnType<typeof createClient>,
  userId: string,
  projectId: string,
  contextType: ProjectContextType,
  key: string,
  value: string,
  confidence: number = 1.0,
  source: SourceAi
): Promise<ProjectContext | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = client as any

  const { data, error } = await supabase
    .from('project_context')
    .upsert({
      project_id: projectId,
      user_id: userId,
      context_type: contextType,
      key,
      value,
      confidence,
      source,
    }, {
      onConflict: 'project_id,context_type,key',
      ignoreDuplicates: false
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving project context:', error)
    return null
  }

  return data as ProjectContext
}

// Server-side helper to save AI insight
export async function saveAiInsight(
  client: ReturnType<typeof createClient>,
  userId: string,
  insightType: InsightType,
  content: string,
  sourceAi: SourceAi,
  options: {
    projectId?: string
    milestoneId?: string
    importance?: number
    conversationId?: string
  } = {}
): Promise<AiInsight | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = client as any

  const { data, error } = await supabase
    .from('ai_insights')
    .insert({
      user_id: userId,
      project_id: options.projectId || null,
      milestone_id: options.milestoneId || null,
      insight_type: insightType,
      content,
      importance: options.importance || 5,
      source_conversation_id: options.conversationId || null,
      source_ai: sourceAi,
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving AI insight:', error)
    return null
  }

  return data as AiInsight
}
