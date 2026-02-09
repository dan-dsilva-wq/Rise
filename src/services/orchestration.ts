import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type {
  AiInsight,
  Database,
  Milestone,
  MilestoneStep,
  Project,
  ProjectContext as StoredProjectContext,
  UserProfileFact,
} from '@/lib/supabase/types'
import type {
  OrchestrationDispatchRecord,
  OrchestrationDispatchStatus,
  OrchestrationMode,
  OrchestrationProjectStatus,
  ProjectContext,
} from '@/types/orchestration'

const ORCHESTRATION_DISPATCH_KIND = 'claude_code_dispatch'

type DbClient = SupabaseClient<Database>

interface DispatchLogInput {
  projectId: string
  milestoneId: string
  stepIndex: number
  stepText: string
  mode: OrchestrationMode
  prompt: string
  acceptanceCriteria: string[]
  status?: OrchestrationDispatchStatus
}

interface ProjectLogRow {
  id: string
  project_id: string
  created_at: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any
}

function toClient(client: DbClient) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const raw of values) {
    const value = raw?.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    output.push(value)
  }
  return output
}

function normalizeProjectStatus(status: Project['status']): OrchestrationProjectStatus {
  if (status === 'discovery' || status === 'planning' || status === 'building' || status === 'launched') {
    return status
  }
  // "paused" exists in DB but orchestration prompt should still pick a productive mode.
  return 'planning'
}

function buildDispatchContent(dispatch: OrchestrationDispatchRecord): string {
  return `Claude dispatch [${dispatch.status}] - ${dispatch.stepText}`
}

function parseDispatchFromLog(row: ProjectLogRow): OrchestrationDispatchRecord | null {
  const orchestration = row.metadata?.orchestration
  if (!orchestration || orchestration.kind !== ORCHESTRATION_DISPATCH_KIND) return null

  const status = orchestration.status === 'done' ? 'done' : 'pending'
  const mode = orchestration.mode === 'do_it_for_me' ? 'do_it_for_me' : 'guide_me'
  const prompt = typeof orchestration.prompt === 'string' ? orchestration.prompt : ''
  const acceptanceCriteria = Array.isArray(orchestration.acceptanceCriteria)
    ? orchestration.acceptanceCriteria.filter((item: unknown): item is string => typeof item === 'string')
    : []

  return {
    id: row.id,
    projectId: row.project_id,
    milestoneId: String(orchestration.milestoneId || ''),
    stepIndex: Number.isFinite(Number(orchestration.stepIndex)) ? Number(orchestration.stepIndex) : 0,
    stepText: String(orchestration.stepText || 'Step'),
    status,
    mode,
    prompt,
    acceptanceCriteria,
    sentAt: typeof orchestration.sentAt === 'string' ? orchestration.sentAt : row.created_at,
    updatedAt: typeof orchestration.updatedAt === 'string' ? orchestration.updatedAt : undefined,
  }
}

function makeConversationExcerpt(
  rows: Array<{ role: 'user' | 'assistant'; content: string }> | null | undefined
): string | undefined {
  if (!rows || rows.length === 0) return undefined
  const ordered = [...rows].reverse()
  return ordered
    .map(row => `${row.role === 'user' ? 'User' : 'Rise'}: ${row.content}`)
    .join('\n\n')
}

function trimLine(content: string, maxChars = 220): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxChars) return compact
  return `${compact.slice(0, maxChars - 1)}...`
}

function buildRelatedDiscussionSnippets(
  rows: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  milestoneTitle: string
): string[] {
  if (!rows.length) return []

  const titleTokens = milestoneTitle
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(token => token.trim())
    .filter(token => token.length > 3)
    .slice(0, 6)

  const isRelevant = (content: string) => {
    if (!titleTokens.length) return false
    const lower = content.toLowerCase()
    return titleTokens.some(token => lower.includes(token))
  }

  const filtered = rows
    .filter(row => row.role !== 'system')
    .filter(row => isRelevant(row.content))

  const source = filtered.length > 0 ? filtered : rows.filter(row => row.role !== 'system')
  return source
    .slice(0, 6)
    .map(row => `${row.role === 'user' ? 'User' : 'Rise'}: ${trimLine(row.content, 180)}`)
}

function buildWorkingStyle(facts: UserProfileFact[]): string {
  const preferenceFacts = facts
    .filter(fact => fact.category === 'preferences')
    .map(fact => fact.fact.trim())
    .filter(Boolean)

  if (preferenceFacts.length > 0) {
    return preferenceFacts.slice(0, 2).join(' | ')
  }
  return 'Prefers practical, step-by-step execution with low friction.'
}

export async function assembleProjectContext(
  projectId: string,
  milestoneId: string,
  stepIndex: number
): Promise<ProjectContext> {
  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  return assembleProjectContextForUser(
    client as unknown as DbClient,
    user.id,
    projectId,
    milestoneId,
    stepIndex
  )
}

export async function assembleProjectContextForUser(
  client: DbClient,
  userId: string,
  projectId: string,
  milestoneId: string,
  stepIndex: number
): Promise<ProjectContext> {
  const supabase = toClient(client)

  const [
    projectResult,
    milestoneResult,
    stepsResult,
    contextResult,
    factsResult,
    insightsResult,
    conversationResult,
    doItConversationResult,
    projectLogResult,
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('milestones')
      .select('*')
      .eq('id', milestoneId)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('milestone_steps')
      .select('id, text, sort_order, is_completed')
      .eq('milestone_id', milestoneId)
      .eq('user_id', userId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('project_context')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId),
    supabase
      .from('user_profile_facts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('category'),
    supabase
      .from('ai_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .or(`project_id.eq.${projectId},project_id.is.null`)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('milestone_conversations')
      .select('id, approach')
      .eq('milestone_id', milestoneId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('milestone_conversations')
      .select('id')
      .eq('milestone_id', milestoneId)
      .eq('user_id', userId)
      .eq('approach', 'do-it')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('project_logs')
      .select('role, content')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (projectResult.error || !projectResult.data) {
    throw new Error(projectResult.error?.message || 'Project not found')
  }

  if (milestoneResult.error || !milestoneResult.data) {
    throw new Error(milestoneResult.error?.message || 'Milestone not found')
  }

  if (stepsResult.error) {
    throw new Error(stepsResult.error.message)
  }

  if (contextResult.error) {
    throw new Error(contextResult.error.message)
  }

  if (factsResult.error) {
    throw new Error(factsResult.error.message)
  }

  if (insightsResult.error) {
    throw new Error(insightsResult.error.message)
  }

  if (doItConversationResult.error) {
    throw new Error(doItConversationResult.error.message)
  }

  if (projectLogResult.error) {
    throw new Error(projectLogResult.error.message)
  }

  const project = projectResult.data as Project
  const milestone = milestoneResult.data as Milestone
  const steps = ((stepsResult.data || []) as MilestoneStep[]).sort((a, b) => a.sort_order - b.sort_order)
  const projectContexts = (contextResult.data || []) as StoredProjectContext[]
  const profileFacts = (factsResult.data || []) as UserProfileFact[]
  const insights = (insightsResult.data || []) as AiInsight[]

  let resolvedStepIndex = Number.isFinite(stepIndex) ? Math.floor(stepIndex) : -1
  if (steps.length === 0) {
    resolvedStepIndex = -1
  } else {
    if (resolvedStepIndex < 0 || resolvedStepIndex >= steps.length) {
      resolvedStepIndex = steps.findIndex(step => !step.is_completed)
    }
    if (resolvedStepIndex < 0) resolvedStepIndex = 0
  }

  const currentStep = resolvedStepIndex >= 0 ? steps[resolvedStepIndex] : null
  const completedSteps = steps
    .filter((step, index) => step.is_completed || (resolvedStepIndex >= 0 && index < resolvedStepIndex))
    .map(step => step.text)
  const remainingSteps = steps
    .filter((step, index) => !step.is_completed && (resolvedStepIndex < 0 || index > resolvedStepIndex))
    .map(step => step.text)

  let conversationExcerpt: string | undefined
  if (conversationResult.data?.id) {
    const { data: messageRows } = await supabase
      .from('milestone_messages')
      .select('role, content')
      .eq('conversation_id', conversationResult.data.id)
      .order('created_at', { ascending: false })
      .limit(6)

    conversationExcerpt = makeConversationExcerpt(
      (messageRows || []) as Array<{ role: 'user' | 'assistant'; content: string }>
    )
  }

  let doItForMeConversation: string | undefined
  if (doItConversationResult.data?.id) {
    const { data: doItRows } = await supabase
      .from('milestone_messages')
      .select('role, content')
      .eq('conversation_id', doItConversationResult.data.id)
      .order('created_at', { ascending: false })
      .limit(12)

    doItForMeConversation = makeConversationExcerpt(
      (doItRows || []) as Array<{ role: 'user' | 'assistant'; content: string }>
    )
  }

  const techComfort = uniqueNonEmpty([
    ...projectContexts.filter(ctx => ctx.context_type === 'tech_stack').map(ctx => ctx.value),
    ...profileFacts.filter(fact => fact.category === 'skills').map(fact => fact.fact),
  ]).slice(0, 12)

  const avoid = uniqueNonEmpty([
    ...profileFacts.filter(fact => fact.category === 'constraints').map(fact => fact.fact),
    ...projectContexts.filter(ctx => ctx.context_type === 'constraints').map(ctx => ctx.value),
  ]).slice(0, 10)

  const decisions = [
    ...projectContexts
      .filter(ctx => ctx.context_type === 'decisions')
      .map(ctx => ({
        description: `${ctx.key}: ${ctx.value}`,
        madeAt: ctx.updated_at || ctx.created_at,
      })),
    ...insights
      .filter(insight => insight.insight_type === 'decision')
      .map(insight => ({
        description: insight.content,
        madeAt: insight.created_at,
      })),
  ]
    .sort((a, b) => new Date(b.madeAt).getTime() - new Date(a.madeAt).getTime())
    .slice(0, 14)

  const relevantInsights = insights
    .filter(
      insight =>
        insight.insight_type === 'discovery' ||
        insight.insight_type === 'blocker' ||
        insight.insight_type === 'learning'
    )
    .slice(0, 12)
    .map(insight => ({
      type: insight.insight_type as 'discovery' | 'blocker' | 'learning',
      content: insight.content,
    }))

  const requirementCriteria = projectContexts
    .filter(ctx => ctx.context_type === 'requirements')
    .map(ctx => `${ctx.key}: ${ctx.value}`)

  const contextBankEntries = projectContexts.map(ctx => ({
    type: ctx.context_type,
    key: ctx.key,
    value: ctx.value,
  }))

  const relatedDiscussions = buildRelatedDiscussionSnippets(
    ((projectLogResult.data || []) as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>),
    milestone.title
  )

  const stepCriteria = (remainingSteps.length > 0 ? remainingSteps : currentStep ? [currentStep.text] : [])
    .map(stepText => `Complete: ${stepText}`)

  const acceptanceCriteria = uniqueNonEmpty([...stepCriteria, ...requirementCriteria])
  if (acceptanceCriteria.length === 0) {
    acceptanceCriteria.push(`Advance "${milestone.title}" with a concrete, testable deliverable.`)
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description || '',
      status: normalizeProjectStatus(project.status),
    },
    task: {
      milestoneTitle: milestone.title,
      milestoneDescription: milestone.description,
      currentStep: currentStep?.text || milestone.title,
      completedSteps,
      remainingSteps,
      mode: conversationResult.data?.approach === 'do-it' ? 'do_it_for_me' : 'guide_me',
    },
    decisions,
    userPreferences: {
      techComfort,
      workingStyle: buildWorkingStyle(profileFacts),
      avoid,
    },
    relevantInsights,
    acceptanceCriteria,
    conversationExcerpt,
    doItForMeConversation,
    relatedDiscussions,
    contextBankEntries,
  }
}

export function generateClaudeCodePrompt(context: ProjectContext): string {
  const lines: string[] = []

  lines.push('You are GPT Codex executing a Rise milestone task in this codebase.')
  lines.push('Use the constraints below as ground truth and keep output focused on execution.')
  lines.push('')
  lines.push('## Project')
  lines.push(`- Name: ${context.project.name}`)
  lines.push(`- Status: ${context.project.status}`)
  lines.push(`- Description: ${context.project.description || 'No description provided.'}`)
  lines.push('')
  lines.push('## Task')
  lines.push(`- Milestone: ${context.task.milestoneTitle}`)
  lines.push(`- Milestone Description: ${context.task.milestoneDescription || 'No description provided.'}`)
  lines.push(`- Current Step: ${context.task.currentStep}`)
  if (context.task.remainingSteps.length > 0) {
    lines.push('- Remaining Steps:')
    context.task.remainingSteps.forEach(step => {
      lines.push(`  - ${step}`)
    })
  } else {
    lines.push('- Remaining Steps: None listed')
  }
  lines.push(`- Execution Mode: ${context.task.mode}`)
  lines.push('')
  lines.push('## Decisions To Respect')
  if (context.decisions.length === 0) {
    lines.push('- None captured yet.')
  } else {
    context.decisions.forEach(decision => {
      lines.push(`- ${decision.description} (made ${decision.madeAt})`)
    })
  }
  lines.push('')
  lines.push('## Context From Planning Conversation')
  if (context.doItForMeConversation) {
    lines.push(context.doItForMeConversation)
  } else if (context.conversationExcerpt) {
    lines.push(context.conversationExcerpt)
  } else {
    lines.push('- No planning conversation context found.')
  }
  lines.push('')
  lines.push('## Technical Decisions & Constraints')
  const technicalEntries = (context.contextBankEntries || [])
    .filter(entry => entry.type === 'tech_stack' || entry.type === 'constraints' || entry.type === 'decisions' || entry.type === 'requirements')
  if (technicalEntries.length === 0) {
    lines.push('- None captured yet.')
  } else {
    technicalEntries.slice(0, 12).forEach(entry => {
      lines.push(`- [${entry.type}] ${entry.key}: ${entry.value}`)
    })
  }
  lines.push('')
  lines.push('## Related Discussions')
  if (context.relatedDiscussions && context.relatedDiscussions.length > 0) {
    context.relatedDiscussions.forEach(snippet => lines.push(`- ${snippet}`))
  } else {
    lines.push('- No related snippets found.')
  }

  lines.push('')
  lines.push('## Acceptance Criteria')
  context.acceptanceCriteria.forEach(criteria => lines.push(`- ${criteria}`))
  lines.push('')
  lines.push('## Execution Requirements')
  lines.push('- Implement the current step first, then align remaining steps if needed.')
  lines.push('- If mode is do_it_for_me: execute changes directly.')
  lines.push('- If mode is guide_me: implement minimally and provide clear next actions.')
  lines.push('- Keep changes scoped to this milestone.')
  lines.push('- Run relevant validation commands before finishing.')
  lines.push('- Return: files changed, what was done, and verification results.')

  return lines.join('\n')
}

export async function logDispatchedTaskForUser(
  client: DbClient,
  userId: string,
  input: DispatchLogInput
): Promise<OrchestrationDispatchRecord> {
  const supabase = toClient(client)
  const sentAt = new Date().toISOString()
  const status = input.status || 'pending'

  const metadata = {
    orchestration: {
      kind: ORCHESTRATION_DISPATCH_KIND,
      milestoneId: input.milestoneId,
      stepIndex: input.stepIndex,
      stepText: input.stepText,
      mode: input.mode,
      prompt: input.prompt,
      acceptanceCriteria: input.acceptanceCriteria,
      status,
      sentAt,
      updatedAt: sentAt,
    },
  }

  const { data, error } = await supabase
    .from('project_logs')
    .insert({
      project_id: input.projectId,
      user_id: userId,
      role: 'system',
      content: `Claude dispatch [${status}] - ${input.stepText}`,
      metadata,
    })
    .select('id, project_id, created_at, metadata')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to log dispatch')
  }

  const parsed = parseDispatchFromLog(data as ProjectLogRow)
  if (!parsed) {
    throw new Error('Dispatch log was saved but could not be parsed')
  }
  return parsed
}

export async function listDispatchedTasksForUser(
  client: DbClient,
  userId: string,
  projectId: string,
  options: { milestoneId?: string; limit?: number } = {}
): Promise<OrchestrationDispatchRecord[]> {
  const supabase = toClient(client)

  const { data, error } = await supabase
    .from('project_logs')
    .select('id, project_id, created_at, metadata')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('role', 'system')
    .order('created_at', { ascending: false })
    .limit(options.limit || 80)

  if (error) {
    throw new Error(error.message)
  }

  return ((data || []) as ProjectLogRow[])
    .map(parseDispatchFromLog)
    .filter((dispatch): dispatch is OrchestrationDispatchRecord => {
      if (!dispatch) return false
      if (options.milestoneId && dispatch.milestoneId !== options.milestoneId) return false
      return true
    })
}

export async function updateDispatchedTaskStatusForUser(
  client: DbClient,
  userId: string,
  projectId: string,
  dispatchId: string,
  status: OrchestrationDispatchStatus
): Promise<OrchestrationDispatchRecord | null> {
  const supabase = toClient(client)

  const { data: existing, error: fetchError } = await supabase
    .from('project_logs')
    .select('id, project_id, created_at, metadata')
    .eq('id', dispatchId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('role', 'system')
    .single()

  if (fetchError || !existing) return null

  const parsed = parseDispatchFromLog(existing as ProjectLogRow)
  if (!parsed) return null

  const updatedAt = new Date().toISOString()
  const nextDispatch: OrchestrationDispatchRecord = {
    ...parsed,
    status,
    updatedAt,
  }

  const existingMetadata = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}
  const orchestration = (existingMetadata as { orchestration?: Record<string, unknown> }).orchestration || {}

  const updatedMetadata = {
    ...existingMetadata,
    orchestration: {
      ...orchestration,
      kind: ORCHESTRATION_DISPATCH_KIND,
      milestoneId: nextDispatch.milestoneId,
      stepIndex: nextDispatch.stepIndex,
      stepText: nextDispatch.stepText,
      mode: nextDispatch.mode,
      prompt: nextDispatch.prompt,
      acceptanceCriteria: nextDispatch.acceptanceCriteria,
      status: nextDispatch.status,
      sentAt: nextDispatch.sentAt,
      updatedAt,
    },
  }

  const { data: updated, error: updateError } = await supabase
    .from('project_logs')
    .update({
      content: buildDispatchContent(nextDispatch),
      metadata: updatedMetadata,
    })
    .eq('id', dispatchId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('role', 'system')
    .select('id, project_id, created_at, metadata')
    .single()

  if (updateError || !updated) {
    throw new Error(updateError?.message || 'Failed to update dispatch status')
  }

  return parseDispatchFromLog(updated as ProjectLogRow)
}
