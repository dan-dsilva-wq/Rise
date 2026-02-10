import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { ANTHROPIC_SONNET_MODEL } from '@/lib/ai/model-config'
import type {
  AiInsight,
  BehaviorPattern,
  ConversationSummary,
  Database,
  DailyLog,
  Milestone,
  ProactiveQuestion,
  Project,
  UserProfileFact,
  UserUnderstanding,
} from '@/lib/supabase/types'

let anthropic: Anthropic | null = null

function getAnthropic(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropic
}

type DbClient = SupabaseClient<Database>

interface SafeError {
  message?: string
}

interface SafeQueryResult<T> {
  data: T
  error: Error | null
}

interface ProjectWithMilestones {
  project: Project
  milestones: Milestone[]
}

interface IntelligencePromptData {
  userUnderstanding: UserUnderstanding | null
  profileFacts: UserProfileFact[]
  insights: AiInsight[]
  projectsWithMilestones: ProjectWithMilestones[]
  recentConversationSummaries: string[]
  behavioralPatterns: string[]
  proactiveQuestions: ProactiveQuestion[]
  dailyLogs: DailyLog[]
}

export interface GapCandidate {
  id: 1 | 2 | 3
  description: string
  whyItMatters: string
  confidence: 'high' | 'medium' | 'low'
}

export interface GapAnalysisResult {
  gaps: GapCandidate[]
  recommendedGapId: 1 | 2 | 3
  recommendationReason: string
  rawResponse: string
  source: 'ai' | 'fallback'
}

export interface GapQuestionResult {
  gap: string
  question: string
  rawResponse: string
  source: 'ai' | 'fallback'
}

export interface NotificationContext {
  userId: string
  userTimezone: string
  lastQuestionSent: Date | null
  lastUserActivity: Date
  currentTime: Date
}

export interface NotificationDecision {
  shouldSend: boolean
  reason: string
  userHour: number
  minutesSinceActivity: number
  hoursSinceActivity: number
  hoursSinceLastQuestion: number | null
  inIdealWindow: boolean
  openedAppToday: boolean
}

const MAX_BLOCK_CHARS = 5500
const MAX_INSIGHTS = 40
const MAX_PROJECTS = 5
const MAX_MILESTONES_PER_PROJECT = 8
const MAX_SUMMARY_LINES = 8

function toClient(client: DbClient) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any
}

function isMissingRelationError(error: SafeError | null | undefined): boolean {
  if (!error?.message) return false
  const message = error.message.toLowerCase()
  return message.includes('relation') && message.includes('does not exist')
}

async function safeListQuery<T>(
  executor: () => Promise<{ data: T[] | null; error: SafeError | null }>,
  fallback: T[] = []
): Promise<SafeQueryResult<T[]>> {
  try {
    const { data, error } = await executor()
    if (error) {
      if (isMissingRelationError(error)) {
        return { data: fallback, error: null }
      }
      return { data: fallback, error: new Error(error.message || 'Query failed') }
    }
    return { data: (data || fallback) as T[], error: null }
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error : new Error('Query failed'),
    }
  }
}

async function safeMaybeSingleQuery<T>(
  executor: () => Promise<{ data: T | null; error: SafeError | null }>,
  fallback: T | null = null
): Promise<SafeQueryResult<T | null>> {
  try {
    const { data, error } = await executor()
    if (error) {
      if (isMissingRelationError(error)) {
        return { data: fallback, error: null }
      }
      return { data: fallback, error: new Error(error.message || 'Query failed') }
    }
    return { data: (data ?? fallback) as T | null, error: null }
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error : new Error('Query failed'),
    }
  }
}

function limitText(input: string, maxChars = MAX_BLOCK_CHARS): string {
  if (!input) return ''
  if (input.length <= maxChars) return input
  return `${input.slice(0, maxChars)}\n...[truncated]`
}

function compactWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

function snippet(input: string, maxChars = 180): string {
  const cleaned = compactWhitespace(input)
  if (cleaned.length <= maxChars) return cleaned
  return `${cleaned.slice(0, maxChars)}...`
}

function formatJsonInline(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toISOString().slice(0, 10)
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function extractTextBlocks(response: Anthropic.Messages.Message): string {
  return response.content
    .filter(block => block.type === 'text')
    .map(block => (block as Anthropic.TextBlock).text)
    .join('\n')
    .trim()
}

function parseGapQuestionResponse(text: string): { gap: string; question: string } | null {
  const trimmed = text.trim()

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { gap?: string; question?: string }
      if (parsed.gap?.trim() && parsed.question?.trim()) {
        return {
          gap: parsed.gap.trim(),
          question: parsed.question.trim(),
        }
      }
    } catch {
      // Continue to text parser below.
    }
  }

  const match = trimmed.match(/GAP:\s*([\s\S]*?)\n\s*QUESTION:\s*([\s\S]*)/i)
  if (!match) return null

  const gap = match[1]?.trim()
  const question = match[2]?.trim()
  if (!gap || !question) return null

  return { gap, question }
}

function parseGapAnalysisResponse(text: string): Omit<GapAnalysisResult, 'source'> | null {
  const trimmed = text.trim()

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        gaps?: Array<{ description?: string; whyItMatters?: string; confidence?: string }>
        recommendedGapId?: number
        recommendationReason?: string
      }

      const parsedGaps: GapCandidate[] = (parsed.gaps || []).slice(0, 3).map((gap, index) => {
        const confidence: GapCandidate['confidence'] =
          gap.confidence === 'high' || gap.confidence === 'medium' || gap.confidence === 'low'
            ? gap.confidence
            : 'medium'

        return {
          id: (index + 1) as 1 | 2 | 3,
          description: gap.description?.trim() || 'Gap not specified',
          whyItMatters: gap.whyItMatters?.trim() || 'No explanation provided.',
          confidence,
        }
      })

      if (parsedGaps.length > 0) {
        const recommendedId = [1, 2, 3].includes(Number(parsed.recommendedGapId))
          ? (Number(parsed.recommendedGapId) as 1 | 2 | 3)
          : parsedGaps[0].id

        return {
          gaps: parsedGaps,
          recommendedGapId: recommendedId,
          recommendationReason: parsed.recommendationReason?.trim() || 'Highest expected guidance impact.',
          rawResponse: trimmed,
        }
      }
    } catch {
      // Continue to text parser below.
    }
  }

  const gapRegex = /GAP\s*(\d+)\s*:\s*([\s\S]*?)\n\s*WHY IT MATTERS:\s*([\s\S]*?)\n\s*CONFIDENCE WE'RE MISSING THIS:\s*(high|medium|low)/gi
  const gaps: GapCandidate[] = []
  let match: RegExpExecArray | null

  while ((match = gapRegex.exec(trimmed)) !== null) {
    const gapId = Number(match[1])
    if (![1, 2, 3].includes(gapId)) continue
    gaps.push({
      id: gapId as 1 | 2 | 3,
      description: match[2].trim(),
      whyItMatters: match[3].trim(),
      confidence: match[4].toLowerCase() as 'high' | 'medium' | 'low',
    })
  }

  if (gaps.length === 0) return null

  const recommendationMatch = trimmed.match(/RECOMMENDED GAP TO ASK ABOUT:\s*([1-3])\s*(?:-|:)?\s*([\s\S]*)/i)
  const recommendedGapId = recommendationMatch
    ? (Number(recommendationMatch[1]) as 1 | 2 | 3)
    : gaps[0].id

  const recommendationReason = recommendationMatch?.[2]?.trim() || 'Highest expected guidance impact.'

  return {
    gaps: gaps.slice(0, 3),
    recommendedGapId,
    recommendationReason,
    rawResponse: trimmed,
  }
}

function buildUserProfileBlock(data: IntelligencePromptData): string {
  const sections: string[] = []

  if (data.userUnderstanding) {
    const understanding = data.userUnderstanding
    sections.push(`Definition of success: ${understanding.definition_of_success || 'Unknown'}`)

    if (understanding.values.length > 0) {
      sections.push(`Values: ${understanding.values.join(' | ')}`)
    }

    if (understanding.motivations.length > 0) {
      sections.push(`Motivations: ${understanding.motivations.join(' | ')}`)
    }

    if (understanding.strengths.length > 0) {
      sections.push(`Strengths: ${understanding.strengths.join(' | ')}`)
    }

    if (understanding.blockers.length > 0) {
      sections.push(`Known blockers: ${understanding.blockers.join(' | ')}`)
    }

    if (understanding.unknown_questions.length > 0) {
      sections.push(`Unknown questions: ${understanding.unknown_questions.join(' | ')}`)
    }

    const background = formatJsonInline(understanding.background)
    if (background !== '{}' && background !== 'null') {
      sections.push(`Background JSON: ${background}`)
    }

    const currentSituation = formatJsonInline(understanding.current_situation)
    if (currentSituation !== '{}' && currentSituation !== 'null') {
      sections.push(`Current situation JSON: ${currentSituation}`)
    }

    const workStyle = formatJsonInline(understanding.work_style)
    if (workStyle !== '{}' && workStyle !== 'null') {
      sections.push(`Work style JSON: ${workStyle}`)
    }
  }

  if (data.profileFacts.length > 0) {
    const categories: Array<UserProfileFact['category']> = [
      'background',
      'skills',
      'situation',
      'goals',
      'preferences',
      'constraints',
    ]

    for (const category of categories) {
      const facts = data.profileFacts.filter(fact => fact.category === category).map(fact => fact.fact.trim())
      if (facts.length === 0) continue
      sections.push(`${category}: ${facts.join(' | ')}`)
    }
  }

  if (sections.length === 0) {
    sections.push('No structured profile yet. User model still sparse.')
  }

  return limitText(sections.join('\n'))
}

function buildDiscoveredInsightsBlock(data: IntelligencePromptData): string {
  if (data.insights.length === 0) {
    return 'No insights captured yet.'
  }

  const lines = data.insights.slice(0, MAX_INSIGHTS).map(insight => {
    const date = formatDateLabel(insight.created_at)
    return `- [${insight.insight_type}] (${insight.importance}/10, ${date}) ${snippet(insight.content, 260)}`
  })

  return limitText(lines.join('\n'))
}

function buildProjectsWithMilestonesBlock(data: IntelligencePromptData): string {
  if (data.projectsWithMilestones.length === 0) {
    return 'No active projects found.'
  }

  const lines: string[] = []

  for (const item of data.projectsWithMilestones.slice(0, MAX_PROJECTS)) {
    const project = item.project
    lines.push(`- Project: ${project.name} [${project.status}]`)
    if (project.description?.trim()) {
      lines.push(`  Description: ${snippet(project.description, 220)}`)
    }

    if (item.milestones.length === 0) {
      lines.push('  Milestones: none')
      continue
    }

    lines.push('  Milestones:')
    for (const milestone of item.milestones.slice(0, MAX_MILESTONES_PER_PROJECT)) {
      lines.push(
        `    - [${milestone.focus_level}] ${milestone.title} (${milestone.status})`
      )
    }
  }

  return limitText(lines.join('\n'))
}

function buildConversationSummaryBlock(data: IntelligencePromptData): string {
  if (data.recentConversationSummaries.length === 0) {
    return 'No recent conversation summaries available.'
  }

  return limitText(data.recentConversationSummaries.slice(0, MAX_SUMMARY_LINES).join('\n'))
}

function deriveBehavioralPatterns(data: IntelligencePromptData): string[] {
  const lines: string[] = []

  if (data.behavioralPatterns.length > 0) {
    lines.push(...data.behavioralPatterns)
  }

  const blockerInsights = data.insights
    .filter(insight => insight.insight_type === 'blocker')
    .map(insight => insight.content)

  if (blockerInsights.length >= 2) {
    lines.push(`Recurring blockers: ${snippet(blockerInsights.slice(0, 2).join(' | '), 260)}`)
  }

  const unansweredQuestions = data.proactiveQuestions
    .filter(question => question.sent_at && !question.answered_at)

  if (unansweredQuestions.length > 0) {
    lines.push(`${unansweredQuestions.length} proactive question(s) are still unanswered.`)
  }

  const moodSeries = data.dailyLogs
    .map(log => log.evening_mood)
    .filter((value): value is number => typeof value === 'number')

  if (moodSeries.length >= 4) {
    const recent = moodSeries.slice(0, 3)
    const older = moodSeries.slice(-3)
    const delta = average(recent) - average(older)

    if (delta >= 1) {
      lines.push('Mood trend: improving recently versus earlier days.')
    } else if (delta <= -1) {
      lines.push('Mood trend: declining recently versus earlier days.')
    } else {
      lines.push('Mood trend: broadly stable.')
    }
  }

  // Lightweight recurring-topic signal from insight text.
  const wordCounts = new Map<string, number>()
  const stopWords = new Set([
    'about', 'after', 'before', 'being', 'build', 'could', 'doing', 'from', 'have', 'into', 'just', 'more', 'that',
    'them', 'they', 'this', 'what', 'when', 'where', 'with', 'your', 'project', 'milestone', 'because', 'still',
  ])

  for (const insight of data.insights) {
    const tokens = insight.content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 5 && !stopWords.has(token))

    for (const token of tokens) {
      wordCounts.set(token, (wordCounts.get(token) || 0) + 1)
    }
  }

  const recurringTopics = [...wordCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([token]) => token)

  if (recurringTopics.length > 0) {
    lines.push(`Topics that keep resurfacing: ${recurringTopics.join(', ')}`)
  }

  if (lines.length === 0) {
    lines.push('Patterns are still sparse; need more observations.')
  }

  return lines.slice(0, 8)
}

function buildBehavioralPatternsBlock(data: IntelligencePromptData): string {
  return limitText(deriveBehavioralPatterns(data).join('\n'))
}

function buildSingleGapQuestionPrompt(data: IntelligencePromptData): string {
  const userProfile = buildUserProfileBlock(data)
  const discoveredInsights = buildDiscoveredInsightsBlock(data)
  const projectsWithMilestones = buildProjectsWithMilestonesBlock(data)
  const recentConversationSummaries = buildConversationSummaryBlock(data)
  const behavioralPatterns = buildBehavioralPatternsBlock(data)

  return `You are Rise's Intelligence Layer - responsible for understanding the user deeply so you can guide them toward what actually matters.

## What You Know About This User

<USER_PROFILE>
${userProfile}
</USER_PROFILE>

<DISCOVERED_INSIGHTS>
${discoveredInsights}
</DISCOVERED_INSIGHTS>

<ACTIVE_PROJECTS>
${projectsWithMilestones}
</ACTIVE_PROJECTS>

<RECENT_CONVERSATIONS>
${recentConversationSummaries}
</RECENT_CONVERSATIONS>

<BEHAVIORAL_PATTERNS>
${behavioralPatterns}
</BEHAVIORAL_PATTERNS>

## Your Task

Analyze everything above and identify the SINGLE most important gap in your understanding of this user - something that, if you knew it, would dramatically improve your ability to help them.

Then generate ONE question to ask them that would fill that gap.

## Rules

1. The question must be SPECIFIC and grounded in context you already have - not generic
2. Reference something concrete they've said or done
3. The question should feel like it comes from someone who's been paying attention
4. Keep it short - one or two sentences max
5. It should make them think, not just answer automatically

## Output Format

GAP: [What you don't understand and why it matters]

QUESTION: [The exact question to send as a notification]

Return JSON as well for machine parsing:
{"gap":"...","question":"..."}`
}

function buildGapDetectionPrompt(data: IntelligencePromptData): string {
  const understandingSections: string[] = []

  if (data.userUnderstanding) {
    understandingSections.push(`definition_of_success: ${data.userUnderstanding.definition_of_success || 'null'}`)
    understandingSections.push(`values: ${data.userUnderstanding.values.join(' | ') || 'none'}`)
    understandingSections.push(`motivations: ${data.userUnderstanding.motivations.join(' | ') || 'none'}`)
    understandingSections.push(`strengths: ${data.userUnderstanding.strengths.join(' | ') || 'none'}`)
    understandingSections.push(`blockers: ${data.userUnderstanding.blockers.join(' | ') || 'none'}`)
    understandingSections.push(`unknown_questions: ${data.userUnderstanding.unknown_questions.join(' | ') || 'none'}`)
    understandingSections.push(`work_style: ${formatJsonInline(data.userUnderstanding.work_style)}`)
  } else {
    understandingSections.push('No user_understanding row exists yet.')
  }

  const insightsBlock = buildDiscoveredInsightsBlock(data)
  const patternsBlock = buildBehavioralPatternsBlock(data)

  const previousQuestionsBlock = data.proactiveQuestions.length > 0
    ? data.proactiveQuestions
      .slice(0, 20)
      .map(question => `- sent=${question.sent_at || 'null'} answered=${question.answered_at || 'null'} gap="${snippet(question.gap_identified, 120)}" question="${snippet(question.question, 150)}" answer="${snippet(question.answer || '', 150)}" quality=${question.quality_score ?? 'null'}`)
      .join('\n')
    : 'No proactive questions logged yet.'

  return `You are analyzing Rise's knowledge about a user to find the most important gap.

## Current Knowledge Model

<USER_UNDERSTANDING>
${limitText(understandingSections.join('\n'))}
</USER_UNDERSTANDING>

<ALL_INSIGHTS>
${insightsBlock}
</ALL_INSIGHTS>

<DETECTED_PATTERNS>
${patternsBlock}
</DETECTED_PATTERNS>

<PREVIOUS_QUESTIONS>
${limitText(previousQuestionsBlock)}
</PREVIOUS_QUESTIONS>

## Your Task

Identify what's MISSING. Look for:

1. Contradictions - they said X but did Y. Why?
2. Vague areas - we know they want meaningful work but not what that means
3. Unstated motivations - we know what they're doing but not why
4. Avoided topics - things that should have come up but have not
5. Stale information - things we learned weeks ago that might have changed
6. Missing context - we're advising on projects but don't know crucial life details

## Output

Return the top 3 gaps, ranked by:
- How much it would improve Rise's ability to help
- How likely they are to actually answer

FORMAT:
GAP 1: [description]
WHY IT MATTERS: [how this would change our guidance]
CONFIDENCE WE'RE MISSING THIS: [high/medium/low]

GAP 2: ...

GAP 3: ...

RECOMMENDED GAP TO ASK ABOUT: [1, 2, or 3 and why]

Return JSON as well for machine parsing:
{
  "gaps": [
    { "description": "...", "whyItMatters": "...", "confidence": "high" },
    { "description": "...", "whyItMatters": "...", "confidence": "medium" },
    { "description": "...", "whyItMatters": "...", "confidence": "low" }
  ],
  "recommendedGapId": 1,
  "recommendationReason": "..."
}`
}

function buildFallbackGapQuestion(data: IntelligencePromptData): GapQuestionResult {
  const activeProject = data.projectsWithMilestones
    .map(item => item.project)
    .find(project => project.status !== 'launched')
    || data.projectsWithMilestones[0]?.project

  const activeMilestone = data.projectsWithMilestones
    .flatMap(item => item.milestones)
    .find(milestone => milestone.focus_level === 'active' && milestone.status !== 'completed' && milestone.status !== 'discarded')

  const strongestBlocker = data.insights.find(insight => insight.insight_type === 'blocker')

  if (!data.userUnderstanding?.definition_of_success?.trim()) {
    const gap = 'We still do not know their concrete definition of success, so guidance may optimize for the wrong outcome.'
    const question = activeProject
      ? `You keep investing in "${activeProject.name}" - what exact outcome over the next 4 months would make you say this season was a win?`
      : 'What exact outcome over the next 4 months would make you say this season was a win for you?'

    return {
      gap,
      question,
      rawResponse: `GAP: ${gap}\nQUESTION: ${question}`,
      source: 'fallback',
    }
  }

  if (strongestBlocker) {
    const gap = 'We do not yet understand the root cause behind a recurring blocker, so recommendations may stay tactical instead of solving the pattern.'
    const question = `You mentioned "${snippet(strongestBlocker.content, 90)}" - what is the real constraint behind that pattern right now: time, confidence, clarity, or something else?`

    return {
      gap,
      question,
      rawResponse: `GAP: ${gap}\nQUESTION: ${question}`,
      source: 'fallback',
    }
  }

  const gap = 'The tradeoff logic behind current priorities is still unclear, which makes it hard to steer decisions when conflicts appear.'
  const question = activeMilestone
    ? `You are currently pushing "${activeMilestone.title}" - what are you explicitly saying no to while this is your focus?`
    : 'When your priorities compete, what rule do you use to decide what gets your focus first?'

  return {
    gap,
    question,
    rawResponse: `GAP: ${gap}\nQUESTION: ${question}`,
    source: 'fallback',
  }
}

function buildFallbackGapAnalysis(data: IntelligencePromptData): GapAnalysisResult {
  const gaps: GapCandidate[] = []

  if (!data.userUnderstanding?.definition_of_success?.trim()) {
    gaps.push({
      id: 1,
      description: 'Concrete definition of success is missing.',
      whyItMatters: 'Without a concrete finish line, Rise can optimize for activity instead of outcomes that actually change the user\'s life.',
      confidence: 'high',
    })
  } else {
    gaps.push({
      id: 1,
      description: 'Decision tradeoff logic is under-specified.',
      whyItMatters: 'When priorities collide, guidance can become inconsistent if we do not know the user\'s decision rule.',
      confidence: 'medium',
    })
  }

  gaps.push({
    id: 2,
    description: 'Root cause behind recurring blockers is unclear.',
    whyItMatters: 'If we only treat surface blockers, we keep repeating the same bottlenecks and lose momentum.',
    confidence: data.insights.some(insight => insight.insight_type === 'blocker') ? 'high' : 'medium',
  })

  gaps.push({
    id: 3,
    description: 'Some existing context may be stale (motivations/situation shifts).',
    whyItMatters: 'Guidance quality degrades fast when life constraints or motivation change but the model still assumes old conditions.',
    confidence: 'medium',
  })

  return {
    gaps,
    recommendedGapId: 1,
    recommendationReason: 'Clarifying success criteria has the largest downstream impact on prioritization and daily guidance.',
    rawResponse: [
      `GAP 1: ${gaps[0].description}`,
      `WHY IT MATTERS: ${gaps[0].whyItMatters}`,
      `CONFIDENCE WE'RE MISSING THIS: ${gaps[0].confidence}`,
      '',
      `GAP 2: ${gaps[1].description}`,
      `WHY IT MATTERS: ${gaps[1].whyItMatters}`,
      `CONFIDENCE WE'RE MISSING THIS: ${gaps[1].confidence}`,
      '',
      `GAP 3: ${gaps[2].description}`,
      `WHY IT MATTERS: ${gaps[2].whyItMatters}`,
      `CONFIDENCE WE'RE MISSING THIS: ${gaps[2].confidence}`,
      '',
      'RECOMMENDED GAP TO ASK ABOUT: 1 - Clarifying success criteria has the highest leverage.',
    ].join('\n'),
    source: 'fallback',
  }
}

export async function assembleIntelligencePromptDataForUser(
  client: DbClient,
  userId: string
): Promise<IntelligencePromptData> {
  const supabase = toClient(client)

  const [
    understandingResult,
    profileFactsResult,
    insightsResult,
    patternsResult,
    proactiveQuestionsResult,
    projectsResult,
    conversationSummariesResult,
    dailyLogsResult,
    projectLogsResult,
    pathFinderMessagesResult,
    milestoneMessagesResult,
  ] = await Promise.all([
    safeMaybeSingleQuery<UserUnderstanding>(() =>
      supabase
        .from('user_understanding')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
    ),
    safeListQuery<UserProfileFact>(() =>
      supabase
        .from('user_profile_facts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('category')
    ),
    safeListQuery<AiInsight>(() =>
      supabase
        .from('ai_insights')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(MAX_INSIGHTS)
    ),
    safeListQuery<BehaviorPattern>(() =>
      supabase
        .from('patterns')
        .select('*')
        .eq('user_id', userId)
        .order('confidence', { ascending: false })
        .order('last_confirmed', { ascending: false })
        .limit(12)
    ),
    safeListQuery<ProactiveQuestion>(() =>
      supabase
        .from('proactive_questions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(25)
    ),
    safeListQuery<Project>(() =>
      supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(MAX_PROJECTS)
    ),
    safeListQuery<ConversationSummary>(() =>
      supabase
        .from('conversation_summaries')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(MAX_SUMMARY_LINES)
    ),
    safeListQuery<DailyLog>(() =>
      supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', userId)
        .order('log_date', { ascending: false })
        .limit(14)
    ),
    safeListQuery<{ created_at: string; role: 'user' | 'assistant' | 'system'; content: string; project_id: string }>(() =>
      supabase
        .from('project_logs')
        .select('created_at, role, content, project_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)
    ),
    safeListQuery<{ created_at: string; role: 'user' | 'assistant'; content: string }>(() =>
      supabase
        .from('path_finder_messages')
        .select('created_at, role, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(6)
    ),
    safeListQuery<{ created_at: string; role: 'user' | 'assistant'; content: string }>(() =>
      supabase
        .from('milestone_messages')
        .select('created_at, role, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(6)
    ),
  ])

  const projects = projectsResult.data
  const projectIds = projects.map(project => project.id)

  const milestonesResult = projectIds.length > 0
    ? await safeListQuery<Milestone>(() =>
      supabase
        .from('milestones')
        .select('*')
        .eq('user_id', userId)
        .in('project_id', projectIds)
        .order('sort_order', { ascending: true })
        .limit(MAX_PROJECTS * MAX_MILESTONES_PER_PROJECT)
    )
    : { data: [] as Milestone[], error: null }

  const milestonesByProject = new Map<string, Milestone[]>()
  for (const milestone of milestonesResult.data) {
    if (!milestonesByProject.has(milestone.project_id)) {
      milestonesByProject.set(milestone.project_id, [])
    }
    milestonesByProject.get(milestone.project_id)?.push(milestone)
  }

  const projectsWithMilestones: ProjectWithMilestones[] = projects.map(project => ({
    project,
    milestones: (milestonesByProject.get(project.id) || []).slice(0, MAX_MILESTONES_PER_PROJECT),
  }))

  const conversationLines: string[] = []

  for (const summary of conversationSummariesResult.data.slice(0, MAX_SUMMARY_LINES)) {
    conversationLines.push(`- [${summary.conversation_key}] ${snippet(summary.summary, 240)}`)
  }

  if (conversationLines.length < MAX_SUMMARY_LINES) {
    for (const log of projectLogsResult.data.slice(0, 4)) {
      conversationLines.push(
        `- [project_chat ${formatDateLabel(log.created_at)}] ${log.role}: ${snippet(log.content, 180)}`
      )
    }

    for (const message of pathFinderMessagesResult.data.slice(0, 2)) {
      conversationLines.push(
        `- [path_finder ${formatDateLabel(message.created_at)}] ${message.role}: ${snippet(message.content, 180)}`
      )
    }

    for (const message of milestoneMessagesResult.data.slice(0, 2)) {
      conversationLines.push(
        `- [milestone_mode ${formatDateLabel(message.created_at)}] ${message.role}: ${snippet(message.content, 180)}`
      )
    }
  }

  const behavioralPatternLines = patternsResult.data
    .slice(0, 8)
    .map(pattern => {
      const confidence = Math.round(pattern.confidence * 100)
      return `${pattern.pattern_type}: ${pattern.description} (confidence ${confidence}%)`
    })

  return {
    userUnderstanding: understandingResult.data,
    profileFacts: profileFactsResult.data,
    insights: insightsResult.data,
    projectsWithMilestones,
    recentConversationSummaries: conversationLines.slice(0, MAX_SUMMARY_LINES),
    behavioralPatterns: behavioralPatternLines,
    proactiveQuestions: proactiveQuestionsResult.data,
    dailyLogs: dailyLogsResult.data,
  }
}

export async function generateGapQuestionForUser(
  client: DbClient,
  userId: string
): Promise<GapQuestionResult> {
  const promptData = await assembleIntelligencePromptDataForUser(client, userId)
  const fallback = buildFallbackGapQuestion(promptData)

  if (!process.env.ANTHROPIC_API_KEY) {
    return fallback
  }

  try {
    const response = await getAnthropic().messages.create({
      model: ANTHROPIC_SONNET_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: buildSingleGapQuestionPrompt(promptData),
        },
      ],
    })

    const raw = extractTextBlocks(response)
    const parsed = parseGapQuestionResponse(raw)
    if (!parsed) {
      return {
        ...fallback,
        rawResponse: raw || fallback.rawResponse,
      }
    }

    return {
      gap: parsed.gap,
      question: parsed.question,
      rawResponse: raw,
      source: 'ai',
    }
  } catch (error) {
    console.error('Failed generating proactive gap question:', error)
    return fallback
  }
}

export async function generateGapAnalysisForUser(
  client: DbClient,
  userId: string
): Promise<GapAnalysisResult> {
  const promptData = await assembleIntelligencePromptDataForUser(client, userId)
  const fallback = buildFallbackGapAnalysis(promptData)

  if (!process.env.ANTHROPIC_API_KEY) {
    return fallback
  }

  try {
    const response = await getAnthropic().messages.create({
      model: ANTHROPIC_SONNET_MODEL,
      max_tokens: 900,
      messages: [
        {
          role: 'user',
          content: buildGapDetectionPrompt(promptData),
        },
      ],
    })

    const raw = extractTextBlocks(response)
    const parsed = parseGapAnalysisResponse(raw)

    if (!parsed) {
      return {
        ...fallback,
        rawResponse: raw || fallback.rawResponse,
      }
    }

    return {
      ...parsed,
      source: 'ai',
    }
  } catch (error) {
    console.error('Failed generating gap analysis:', error)
    return fallback
  }
}

