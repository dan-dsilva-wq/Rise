// Server-side AI context utilities - NO 'use client' directive
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProjectContext,
  AiInsight,
  UserProfileFact,
  ProjectContextType,
  InsightType,
  SourceAi,
  ProfileCategory,
} from '@/lib/supabase/types'
import {
  areNearDuplicateMemories,
  isLikelyRelevantInsight,
  isLikelyRelevantProfileFact,
  normalizeMemoryText,
} from '@/lib/memory/relevance'

interface FormattedContext {
  profileSummary: string
  projectContext: string
  insights: string
  fullContext: string
}

function sanitizeProfileFacts(facts: UserProfileFact[]): UserProfileFact[] {
  const kept: UserProfileFact[] = []
  for (const fact of facts) {
    const cleaned = normalizeMemoryText(fact.fact)
    if (!isLikelyRelevantProfileFact(cleaned)) continue
    const duplicate = kept.some(existing => areNearDuplicateMemories(existing.fact, cleaned))
    if (duplicate) continue
    kept.push({ ...fact, fact: cleaned })
  }
  return kept
}

function sanitizeInsights(insights: AiInsight[]): AiInsight[] {
  const kept: AiInsight[] = []
  for (const insight of insights) {
    const cleaned = normalizeMemoryText(insight.content)
    if (!isLikelyRelevantInsight(cleaned, insight.importance)) continue
    const duplicate = kept.some(existing => areNearDuplicateMemories(existing.content, cleaned))
    if (duplicate) continue
    kept.push({ ...insight, content: cleaned })
  }
  return kept
}

// Server-side helper to fetch context (for API routes)
export async function fetchAiContextForApi(
  client: SupabaseClient,
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
  const insights = sanitizeInsights((insightsResult.data as AiInsight[]) || [])
  const profileFacts = sanitizeProfileFacts((factsResult.data as UserProfileFact[]) || [])

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
  client: SupabaseClient,
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

export async function saveUserProfileFact(
  client: SupabaseClient,
  userId: string,
  category: ProfileCategory,
  fact: string
): Promise<UserProfileFact | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = client as any
  const cleanedFact = normalizeMemoryText(fact)
  if (!isLikelyRelevantProfileFact(cleanedFact)) {
    return null
  }

  const { data: existingRows } = await supabase
    .from('user_profile_facts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(120)

  const existingFacts = (existingRows as UserProfileFact[]) || []
  const duplicate = existingFacts.find(existing => areNearDuplicateMemories(existing.fact, cleanedFact))
  if (duplicate) {
    return duplicate
  }

  const { data, error } = await supabase
    .from('user_profile_facts')
    .insert({
      user_id: userId,
      category,
      fact: cleanedFact,
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving profile fact:', error)
    return null
  }

  return data as UserProfileFact
}

// Server-side helper to save AI insight
export async function saveAiInsight(
  client: SupabaseClient,
  userId: string,
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
): Promise<AiInsight | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = client as any
  const cleanedContent = normalizeMemoryText(content)
  const clampedImportance = Math.max(1, Math.min(10, options.importance || 5))
  if (!isLikelyRelevantInsight(cleanedContent, clampedImportance)) {
    return null
  }

  const { data: existingRows } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(120)

  const existingInsights = (existingRows as AiInsight[]) || []
  const duplicate = existingInsights.find(existing => areNearDuplicateMemories(existing.content, cleanedContent))
  if (duplicate) {
    if (duplicate.importance < clampedImportance) {
      await supabase
        .from('ai_insights')
        .update({ importance: clampedImportance })
        .eq('id', duplicate.id)
        .eq('user_id', userId)
    }
    return duplicate
  }

  const { data, error } = await supabase
    .from('ai_insights')
    .insert({
      user_id: userId,
      project_id: options.projectId || null,
      milestone_id: options.milestoneId || null,
      insight_type: insightType,
      content: cleanedContent,
      importance: clampedImportance,
      source_conversation_id: options.conversationId || null,
      source_ai: sourceAi,
      expires_at: options.expiresAt || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving AI insight:', error)
    return null
  }

  return data as AiInsight
}
