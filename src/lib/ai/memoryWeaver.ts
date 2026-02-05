/**
 * Memory Weaver - Rise's Unified Memory System
 *
 * Makes Rise feel like ONE mind across all conversations.
 * Synthesizes recent messages from Path Finder, Milestone Mode, and Project Chat
 * into a coherent narrative that gets injected into every AI prompt.
 *
 * This creates the "holy shit, it actually gets me" moments:
 * - "I noticed you mentioned pricing anxiety in Path Finder yesterday"
 * - "Last week you were excited about the mobile-first approach - how's that going?"
 * - "You've been circling around the launch decision for 3 days now"
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { InsightType } from '@/lib/supabase/types'

// ───────────────────────────────────────────
// Shared Insight Parser
// ───────────────────────────────────────────

/**
 * Parses [INSIGHT]...[/INSIGHT] tags from AI responses.
 *
 * Both /api/chat and /api/milestone-mode inject instructions for the AI to emit
 * insight tags. This shared parser extracts them into structured objects.
 *
 * Previously duplicated in chat/route.ts and milestone-mode/route.ts (Loop 12 observation).
 */
export function parseInsightTags(message: string): Array<{ type: InsightType; content: string; importance: number }> {
  const insights: Array<{ type: InsightType; content: string; importance: number }> = []
  const insightRegex = /\[INSIGHT\]\s*type:\s*(\w+)\s*content:\s*([^\n]+)\s*(?:importance:\s*(\d+)\s*)?\[\/INSIGHT\]/gi

  let match
  while ((match = insightRegex.exec(message)) !== null) {
    const type = match[1].toLowerCase() as InsightType
    const content = match[2].trim()
    const importance = match[3] ? parseInt(match[3], 10) : 5

    if (['discovery', 'decision', 'blocker', 'preference', 'learning'].includes(type) && content) {
      insights.push({ type, content, importance })
    }
  }

  return insights
}

/**
 * Strips [INSIGHT]...[/INSIGHT] tags from an AI message so users never see them.
 */
export function stripInsightTags(message: string): string {
  return message.replace(/\[INSIGHT\][\s\S]*?\[\/INSIGHT\]/gi, '').trim()
}

// ───────────────────────────────────────────
// Rise Personality Core
// ───────────────────────────────────────────

/**
 * Fetches the user's display name from the profiles table.
 * Used by chat routes to personalize AI conversations.
 */
export async function fetchDisplayName(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (client as any)
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single()
    return data?.display_name || null
  } catch {
    return null
  }
}

/**
 * Builds the shared Rise personality instructions injected into every AI prompt.
 *
 * This is the SINGLE source of truth for how Rise behaves across:
 * - /api/chat (project builder chat)
 * - /api/milestone-mode (focused milestone work)
 *
 * Having one personality core ensures the AI feels like ONE mind —
 * same voice, same warmth, same awareness — regardless of which
 * surface the user is talking through.
 *
 * @param displayName - The user's name (null = unknown)
 * @param userThreadBlock - The synthesized User Thread (personality/patterns)
 * @param memoryBlock - The woven cross-conversation memory
 */
export function buildRisePersonalityCore(opts: {
  displayName: string | null
  userThreadBlock?: string | null
  memoryBlock?: string | null
}): string {
  const nameLine = opts.displayName
    ? `\n## The Person You're Talking To\nTheir name is **${opts.displayName}**. Use it naturally — not every message, but enough that it feels personal. A cofounder knows your name.`
    : ''

  // Build memory instructions based on what context is actually available.
  // This is what makes Rise feel like ONE mind — the AI gets explicit guidance
  // on how to weave memories into conversation, not just a data dump.
  const hasMemory = !!opts.memoryBlock
  const hasThread = !!opts.userThreadBlock

  let memoryInstructions = ''
  if (hasMemory || hasThread) {
    memoryInstructions = `\n\n## How to Use What You Know
You have context from past conversations and sessions. Use it like a real cofounder would — naturally, not robotically.

**DO:**
- Connect dots across conversations when genuinely relevant ("Last time we talked about X, and now that you're working on Y, there's an interesting connection...")
- Reference their past decisions to avoid re-litigating them ("You already decided to go with Tailwind — let's build on that")
- Notice patterns ("I've seen you get stuck at the same point a few times — the planning phase. Want to try a different approach?")
- Acknowledge their journey ("You've come a long way from when you were still figuring out the idea")

**DON'T:**
- Force cross-references when they're not relevant — only connect dots when it genuinely helps
- Recite their history back at them ("As you mentioned on January 3rd...") — that's creepy, not helpful
- Ignore context and ask questions you already know the answer to`
  }

  return `## Rise Identity — Who You Are
You are Rise — a single AI mind that exists across all conversations with this user. You are their cofounder: warm, direct, and genuinely invested in their success. You remember past conversations, you notice patterns, and you care.

**Voice:** Confident but not arrogant. Supportive but not sycophantic. Brief when brevity helps, thorough when depth is needed. You talk like a smart friend who happens to be an expert — not like a corporate chatbot.

**Principles:**
- Be real. No fake enthusiasm, no empty praise. Celebrate actual progress.
- Be proactive. If you notice something — a pattern, a blocker, a better approach — say it.
- Be efficient. Respect their time and energy. Get to the point.
- Be human. It's okay to say "I don't know, let's figure it out."${nameLine}${memoryInstructions}`
}

// ───────────────────────────────────────────
// Server-Side Memory Cache
// ───────────────────────────────────────────
// During active chat sessions, weaveMemory and synthesizeUserThread get called
// on EVERY message. Each call fires 5-10+ DB queries. For a user sending
// 10 messages in 5 minutes, that's 100+ redundant queries.
//
// This cache stores the results per-user with a short TTL so the heavy
// queries only run once per cache window, not per message.
// The cache lives in module scope (Node.js process memory) — it's
// shared across requests in the same serverless instance.

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const MEMORY_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const USER_THREAD_CACHE_TTL = 10 * 60 * 1000 // 10 minutes (changes even less often)
const serverCache = new Map<string, CacheEntry<unknown>>()

// Periodic cleanup to prevent unbounded growth (runs at most once per minute)
let lastCleanup = 0
function cleanupCache() {
  const now = Date.now()
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [key, entry] of serverCache) {
    if (now > entry.expiresAt) serverCache.delete(key)
  }
}

function getCached<T>(key: string): T | null {
  const entry = serverCache.get(key)
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) serverCache.delete(key)
    return null
  }
  return entry.data as T
}

function setCached<T>(key: string, data: T, ttl: number): void {
  cleanupCache()
  serverCache.set(key, { data, expiresAt: Date.now() + ttl })
}

/**
 * Cached version of weaveMemory — safe for per-message use in chat routes.
 * Returns the same result as weaveMemory but only hits the DB once per TTL window.
 * Falls back to a fresh call if the cache misses.
 */
export async function cachedWeaveMemory(
  client: SupabaseClient,
  userId: string,
  options: Parameters<typeof weaveMemory>[2] = {},
): Promise<WovenMemory> {
  const cacheKey = `wm:${userId}:${options.currentSource || 'all'}:${options.projectId || 'none'}`
  const cached = getCached<WovenMemory>(cacheKey)
  if (cached) return cached

  const result = await weaveMemory(client, userId, options)
  setCached(cacheKey, result, MEMORY_CACHE_TTL)
  return result
}

/**
 * Cached version of synthesizeUserThread — safe for per-message use in chat routes.
 * User personality/patterns change slowly, so a longer TTL is appropriate.
 */
export async function cachedSynthesizeUserThread(
  client: SupabaseClient,
  userId: string,
  options: Parameters<typeof synthesizeUserThread>[2] = {},
): Promise<UserThread> {
  const cacheKey = `ut:${userId}`
  const cached = getCached<UserThread>(cacheKey)
  if (cached) return cached

  const result = await synthesizeUserThread(client, userId, options)
  setCached(cacheKey, result, USER_THREAD_CACHE_TTL)
  return result
}

// ───────────────────────────────────────────
// Shared Step Resolver
// ───────────────────────────────────────────

/**
 * Resolved step information for a milestone.
 * Used by morning briefing (dashboard), chat route, and build page
 * to show the user exactly where they are.
 */
export interface ResolvedStep {
  stepId: string
  stepText: string
  stepNumber: number
  totalSteps: number
  completedSteps: number
}

/**
 * Resolved active milestone + its current step for a project.
 * Combines finding the active milestone AND resolving its step progress.
 */
export interface ResolvedMilestoneStep {
  milestoneTitle: string
  milestoneId: string
  currentStepText: string | null
  stepNumber: number | null
  totalSteps: number
  completedSteps: number
}

/**
 * Fetches the current step for a given milestone.
 *
 * Shared utility that replaces duplicate implementations across:
 * - /api/morning-briefing/route.ts (was `fetchCurrentStep`)
 * - /api/chat/route.ts (was part of `fetchActiveMilestoneStep`)
 * - /projects/[id]/build/page.tsx (could use this)
 */
export async function resolveCurrentStep(
  client: SupabaseClient,
  milestoneId: string,
  userId: string,
): Promise<ResolvedStep | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = client as any
  try {
    const { data: steps } = await supabase
      .from('milestone_steps')
      .select('id, text, is_completed, sort_order')
      .eq('milestone_id', milestoneId)
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })

    if (!steps || steps.length === 0) return null

    const typedSteps = steps as { id: string; text: string; is_completed: boolean; sort_order: number }[]
    const completedSteps = typedSteps.filter(s => s.is_completed).length
    const currentStep = typedSteps.find(s => !s.is_completed)

    if (!currentStep) {
      // All steps complete — return info about last step
      return {
        stepId: typedSteps[typedSteps.length - 1].id,
        stepText: typedSteps[typedSteps.length - 1].text,
        stepNumber: typedSteps.length,
        totalSteps: typedSteps.length,
        completedSteps,
      }
    }

    return {
      stepId: currentStep.id,
      stepText: currentStep.text,
      stepNumber: typedSteps.findIndex(s => s.id === currentStep.id) + 1,
      totalSteps: typedSteps.length,
      completedSteps,
    }
  } catch {
    return null
  }
}

/**
 * Finds the active milestone for a project and resolves its current step.
 *
 * Priority: focus_level 'active' > 'next' > first non-completed/discarded/idea.
 *
 * Shared utility that replaces duplicate implementations across:
 * - /api/chat/route.ts (was `fetchActiveMilestoneStep`)
 * - /api/morning-briefing/route.ts (was inline logic + `fetchCurrentStep`)
 */
export async function resolveActiveMilestoneStep(
  client: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<ResolvedMilestoneStep | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = client as any
  try {
    const { data: milestones } = await supabase
      .from('milestones')
      .select('id, title, focus_level, status')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })

    if (!milestones || milestones.length === 0) return null

    const active = milestones.find((m: { focus_level: string }) => m.focus_level === 'active')
      || milestones.find((m: { focus_level: string }) => m.focus_level === 'next')
      || milestones.find((m: { status: string }) => m.status !== 'completed' && m.status !== 'discarded' && m.status !== 'idea')

    if (!active) return null

    const step = await resolveCurrentStep(client, active.id, userId)

    return {
      milestoneTitle: active.title,
      milestoneId: active.id,
      currentStepText: step?.stepText || null,
      stepNumber: step?.stepNumber || null,
      totalSteps: step?.totalSteps || 0,
      completedSteps: step?.completedSteps || 0,
    }
  } catch {
    return null
  }
}

// ───────────────────────────────────────────
// Shared Greeting Signals Builder
// ───────────────────────────────────────────

/**
 * Builds rich memory signals for greeting generators (personal greeting, builder chat opener, etc.)
 *
 * This is the SINGLE source of truth for greeting signals across the entire app.
 * It extracts conversation continuity, project momentum, and engagement patterns
 * from recent DB data — all without an AI call.
 *
 * Used by:
 * - /api/morning-briefing (dashboard personal greeting)
 * - /projects/[id]/build/page.tsx (builder chat opener)
 * - Any future surface that needs to understand the user's recent context
 */
export async function buildGreetingSignals(
  client: SupabaseClient,
  userId: string,
  wovenMemory?: { contextBlock: string; sourceCount: number; hasCrossThreadInsights: boolean } | null,
): Promise<GreetingMemorySignals> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = client as any
  const signals: GreetingMemorySignals = {}

  try {
    // Fetch the most recent user message across all conversation sources in parallel
    const [pathFinderMsg, milestoneMsg, projectLogMsg, weeklyCompletions, loginDates] = await Promise.all([
      // Most recent path finder message from the user
      supabase.from('path_finder_messages')
        .select('content, created_at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1),
      // Most recent milestone mode message from the user
      supabase.from('milestone_messages')
        .select('content, created_at, conversation_id')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1),
      // Most recent project chat message from the user
      supabase.from('project_logs')
        .select('content, created_at, project_id, role')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1),
      // Milestones completed in the last 7 days
      supabase.from('milestones')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .gte('completed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      // Recent daily log dates (for login streak / days since last visit)
      supabase.from('daily_logs')
        .select('log_date')
        .eq('user_id', userId)
        .order('log_date', { ascending: false })
        .limit(14),
    ])

    // Find the most recent user message across all sources
    const candidates: Array<{
      content: string
      created_at: string
      source: 'path_finder' | 'milestone_mode' | 'project_chat'
      conversationId?: string
      projectId?: string
    }> = []

    if (pathFinderMsg.data?.[0]) {
      candidates.push({ ...pathFinderMsg.data[0], source: 'path_finder' })
    }
    if (milestoneMsg.data?.[0]) {
      candidates.push({
        ...milestoneMsg.data[0],
        source: 'milestone_mode',
        conversationId: milestoneMsg.data[0].conversation_id,
      })
    }
    if (projectLogMsg.data?.[0]) {
      candidates.push({
        ...projectLogMsg.data[0],
        source: 'project_chat',
        projectId: projectLogMsg.data[0].project_id,
      })
    }

    if (candidates.length > 0) {
      // Sort by created_at descending to find the most recent
      candidates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const latest = candidates[0]
      const hoursAgo = (Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60)

      signals.lastUserMessage = latest.content
      signals.lastMessageSource = latest.source
      signals.lastMessageHoursAgo = Math.round(hoursAgo)

      // Resolve project/milestone names for the last conversation
      if (latest.source === 'milestone_mode' && latest.conversationId) {
        const { data: conv } = await supabase.from('milestone_conversations')
          .select('milestone_id')
          .eq('id', latest.conversationId)
          .single()
        if (conv?.milestone_id) {
          const { data: ms } = await supabase.from('milestones')
            .select('title, project_id')
            .eq('id', conv.milestone_id)
            .single()
          if (ms) {
            signals.lastConversationMilestone = ms.title
            const { data: proj } = await supabase.from('projects')
              .select('name')
              .eq('id', ms.project_id)
              .single()
            signals.lastConversationProject = proj?.name || null
          }
        }
      } else if (latest.source === 'project_chat' && latest.projectId) {
        const { data: proj } = await supabase.from('projects')
          .select('name')
          .eq('id', latest.projectId)
          .single()
        signals.lastConversationProject = proj?.name || null
      }
    }

    // Weekly milestone completions
    signals.milestonesCompletedThisWeek = weeklyCompletions.data?.length || 0

    // Calculate days since last visit and login streak from daily log dates
    const logDates = ((loginDates.data || []) as Array<{ log_date: string }>).map(l => l.log_date)
    if (logDates.length > 0) {
      const today = new Date().toISOString().split('T')[0]
      const mostRecentLog = logDates[0]

      // Days since last visit: diff between today and most recent log
      const todayDate = new Date(today + 'T00:00:00Z')
      const lastDate = new Date(mostRecentLog + 'T00:00:00Z')
      const daysDiff = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      signals.daysSinceLastVisit = daysDiff

      // Calculate consecutive login streak
      let streak = 0
      const dateSet = new Set(logDates)
      for (let i = 0; i < 14; i++) {
        const checkDate = new Date(todayDate)
        checkDate.setDate(checkDate.getDate() - i)
        const dateStr = checkDate.toISOString().split('T')[0]
        if (dateSet.has(dateStr)) {
          streak++
        } else if (i === 0) {
          // Today might not have a log yet — that's okay, check from yesterday
          continue
        } else {
          break
        }
      }
      signals.currentLoginStreak = streak
    }

    // Extract recurring themes and open loops from woven memory if available
    if (wovenMemory?.contextBlock) {
      const themesMatch = wovenMemory.contextBlock.match(/Topics that keep coming up: (.+)/i)
      if (themesMatch) {
        signals.recurringThemes = themesMatch[1].split(', ').map(t => t.trim()).filter(Boolean)
      }
      // Extract open loops section
      const loopsMatch = wovenMemory.contextBlock.match(/### Open Loops[^\n]*\n([\s\S]*?)(?=###|$)/i)
      if (loopsMatch) {
        signals.openLoops = loopsMatch[1]
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.trim().replace(/^-\s*/, ''))
          .filter(Boolean)
          .slice(0, 3)
      }
    }
  } catch (err) {
    console.error('Error building greeting signals:', err)
    // Return partial signals rather than failing entirely
  }

  return signals
}

interface ConversationThread {
  source: 'path_finder' | 'milestone_mode' | 'project_chat'
  messages: { role: string; content: string; created_at: string }[]
  projectName?: string
  milestoneTitle?: string
}

interface MemorySnapshot {
  recentThreads: ConversationThread[]
  emotionalArc: string | null
  openLoops: string[]
  recurringThemes: string[]
  lastSessionSummary: string | null
}

interface WovenMemory {
  /** Full formatted context block for system prompts */
  contextBlock: string
  /** Short summary for token-constrained prompts */
  briefSummary: string
  /** Number of conversation sources included */
  sourceCount: number
  /** Whether there's meaningful cross-conversation context */
  hasCrossThreadInsights: boolean
}

/**
 * Rich context signals for memory-aware greetings.
 * Passed from the API route which has access to conversation + project data.
 */
export interface GreetingMemorySignals {
  /** The user's last conversation message (any source) */
  lastUserMessage?: string | null
  /** Which source that last message came from */
  lastMessageSource?: 'path_finder' | 'milestone_mode' | 'project_chat' | null
  /** How many hours ago the last message was sent */
  lastMessageHoursAgo?: number | null
  /** The project name the last conversation was about */
  lastConversationProject?: string | null
  /** The milestone title they were working on */
  lastConversationMilestone?: string | null
  /** Number of milestones completed in the last 7 days */
  milestonesCompletedThisWeek?: number
  /** Number of consecutive days they've logged in */
  currentLoginStreak?: number
  /** Days since they last opened the app (0 = today, 1 = yesterday) */
  daysSinceLastVisit?: number
  /** Recurring themes from across conversations */
  recurringThemes?: string[]
  /** Open loops — things user committed to or was uncertain about */
  openLoops?: string[]
}

/**
 * Generates a warm, context-aware personal greeting based on recent data.
 * This runs server-side without an AI call — pure data synthesis.
 * Used as the instant "Rise remembers you" moment before heavier AI loads.
 *
 * Priority system: memory-aware signals first (conversations, projects),
 * then emotional signals (mood/energy), then generic warmth.
 */
export function generatePersonalGreeting(
  dailyLogs: Array<{
    log_date: string
    morning_mood: number | null
    morning_energy: number | null
    evening_mood: number | null
    evening_energy: number | null
    day_rating: number | null
    gratitude_entry: string | null
  }>,
  displayName: string | null,
  recentMilestoneCompleted?: string | null,
  daysActive?: number,
  memorySignals?: GreetingMemorySignals,
): string {
  const name = displayName || 'there'
  const hour = new Date().getHours()

  // ─── TIER 1: RETURNING AFTER ABSENCE (strongest signal) ───
  // User was gone for 2+ days — acknowledge it warmly, remind them where they left off
  if (memorySignals?.daysSinceLastVisit && memorySignals.daysSinceLastVisit >= 2) {
    const days = memorySignals.daysSinceLastVisit

    // They left off working on something specific
    if (memorySignals.lastConversationMilestone && memorySignals.lastConversationProject) {
      return `It's been ${days} days, ${name}. Last time, you were working on "${memorySignals.lastConversationMilestone}" — ready to pick up where you left off?`
    }
    if (memorySignals.lastConversationProject) {
      return `Welcome back, ${name}. It's been ${days} days — your "${memorySignals.lastConversationProject}" project is waiting for you.`
    }
    // No specific project context, just warm welcome back
    if (days >= 7) {
      return `${name}, it's been a while. No guilt, no pressure — I'm just glad you're here. Let's figure out today.`
    }
    return `Been a few days, ${name}. That's okay — what matters is you showed up. Where do we start?`
  }

  // ─── TIER 2: CONVERSATION CONTINUITY (the "one mind" moment) ───
  // Reference what they were talking about recently to create the "it remembers me" effect
  if (memorySignals?.lastUserMessage && memorySignals.lastMessageHoursAgo != null) {
    const hoursAgo = memorySignals.lastMessageHoursAgo
    const truncatedMsg = memorySignals.lastUserMessage.length > 80
      ? memorySignals.lastUserMessage.slice(0, 77) + '...'
      : memorySignals.lastUserMessage

    // Very recent conversation (within a few hours) — they might be mid-flow
    if (hoursAgo < 4 && memorySignals.lastConversationMilestone) {
      return `Still going with "${memorySignals.lastConversationMilestone}"? I'm right here, ${name}.`
    }

    // Yesterday's conversation — create continuity
    if (hoursAgo >= 12 && hoursAgo < 36) {
      // If they were working on something specific
      if (memorySignals.lastConversationMilestone) {
        return `Yesterday you were deep in "${memorySignals.lastConversationMilestone}". How are you feeling about it today, ${name}?`
      }
      // If they said something we can reflect back
      if (truncatedMsg.length > 20) {
        return `I've been thinking about what you said: "${truncatedMsg}" — let's build on that today, ${name}.`
      }
    }
  }

  // ─── TIER 3: OPEN LOOPS (things they committed to) ───
  if (memorySignals?.openLoops && memorySignals.openLoops.length > 0) {
    // Pick the most recent open loop and reference it gently
    const loop = memorySignals.openLoops[0]
    // Extract just the quoted content from the loop format "[source] "content""
    const quoteMatch = loop.match(/"([^"]+)"/)
    if (quoteMatch && quoteMatch[1].length > 15 && quoteMatch[1].length < 120) {
      return `Something you said is on my mind: "${quoteMatch[1]}" — ready to follow through on that, ${name}?`
    }
  }

  // ─── TIER 4: MOMENTUM & MILESTONES ───
  // Completed a milestone recently
  if (recentMilestoneCompleted) {
    // If they also have strong momentum (multiple completions this week)
    if (memorySignals?.milestonesCompletedThisWeek && memorySignals.milestonesCompletedThisWeek >= 2) {
      return `${memorySignals.milestonesCompletedThisWeek} milestones done this week, including "${recentMilestoneCompleted}". You're on a roll, ${name}.`
    }
    return `You finished "${recentMilestoneCompleted}" — that's real progress, ${name}. What's next?`
  }

  // Strong weekly momentum even without a very recent completion
  if (memorySignals?.milestonesCompletedThisWeek && memorySignals.milestonesCompletedThisWeek >= 3) {
    return `${memorySignals.milestonesCompletedThisWeek} milestones this week. You're building something real, ${name}.`
  }

  // ─── TIER 5: RECURRING THEMES (pattern recognition) ───
  if (memorySignals?.recurringThemes && memorySignals.recurringThemes.length >= 2) {
    const themes = memorySignals.recurringThemes.slice(0, 2).join(' and ')
    return `I've noticed ${themes} keep coming up across our conversations. There might be something worth exploring there, ${name}.`
  }

  // ─── TIER 6: EMOTIONAL SIGNALS (original mood-based greetings) ───
  const yesterday = dailyLogs[0]
  const dayBefore = dailyLogs[1]

  // Tough evening yesterday
  if (yesterday?.evening_mood && yesterday.evening_mood <= 3) {
    if (hour < 12) {
      return `Yesterday was rough, ${name}. But you're here this morning — that counts for something. Let's make today a little better.`
    }
    return `I know yesterday wasn't easy. Glad you're back, ${name}.`
  }

  // Great day yesterday
  if (yesterday?.day_rating && yesterday.day_rating >= 8) {
    return `You had a great day yesterday, ${name}. Let's keep that energy going.`
  }

  // Mood trending down over last few days
  if (dailyLogs.length >= 3) {
    const recentMoods = dailyLogs.slice(0, 3)
      .filter(l => l.evening_mood != null)
      .map(l => l.evening_mood!)
    if (recentMoods.length >= 2 && recentMoods.every(m => m <= 4)) {
      return `I've noticed things have been heavy lately, ${name}. No pressure today — just show up for yourself. That's enough.`
    }
  }

  // Mood improved from morning to evening yesterday (they rallied)
  if (yesterday?.morning_mood && yesterday?.evening_mood &&
      yesterday.evening_mood > yesterday.morning_mood + 2) {
    return `You turned yesterday around — started low but ended strong. That resilience is worth noticing, ${name}.`
  }

  // Gratitude reflection
  if (yesterday?.gratitude_entry) {
    const shortGratitude = yesterday.gratitude_entry.length > 60
      ? yesterday.gratitude_entry.slice(0, 57) + '...'
      : yesterday.gratitude_entry
    return `Last night you were grateful for: "${shortGratitude}" — I love that you noticed that, ${name}.`
  }

  // Energy was low yesterday evening
  if (yesterday?.evening_energy && yesterday.evening_energy <= 3) {
    if (hour < 12) {
      return `You were pretty drained last night. Hope you got some rest, ${name}. We'll take it easy today.`
    }
  }

  // Mood improvement day-over-day
  if (yesterday?.evening_mood && dayBefore?.evening_mood &&
      yesterday.evening_mood > dayBefore.evening_mood + 1) {
    return `Your mood has been climbing, ${name}. Something's shifting in a good direction.`
  }

  // ─── TIER 7: LOGIN STREAK ───
  if (memorySignals?.currentLoginStreak && memorySignals.currentLoginStreak >= 3) {
    const streak = memorySignals.currentLoginStreak
    if (streak >= 7) {
      return `${streak} days in a row, ${name}. That quiet consistency? It's building something you can't see yet.`
    }
    return `Day ${streak} in a row. You keep showing up, ${name}. That's how things change.`
  }

  // ─── TIER 8: DEFAULT WARMTH ───
  // First time or very new user
  if (!dailyLogs.length || (daysActive && daysActive <= 2)) {
    if (hour < 12) {
      return `Good to see you this morning, ${name}. Let's figure out today together.`
    }
    return `Hey ${name}. Ready to make some progress?`
  }

  // Default warmth — varies by time of day
  if (hour < 12) {
    return `Morning, ${name}. Let's see what today has in store.`
  }
  if (hour < 17) {
    return `Good to see you, ${name}. Let's make the most of the afternoon.`
  }
  return `Evening, ${name}. How's the day been?`
}

/**
 * Context signals for generating a memory-aware milestone chat opening.
 * Built from recent DB data without an AI call.
 */
export interface MilestoneOpenerSignals {
  /** The milestone title we're working on */
  milestoneTitle: string
  /** The project name */
  projectName: string
  /** Current step text (if steps exist) */
  currentStepText?: string | null
  /** Step progress: completed / total */
  completedSteps?: number
  totalSteps?: number
  /** The user's last message in THIS milestone's conversation */
  lastMilestoneMessage?: string | null
  /** Hours since their last message in this milestone */
  lastMilestoneMessageHoursAgo?: number | null
  /** The user's most recent daily log mood */
  currentMood?: number | null
  /** The user's most recent daily log energy */
  currentEnergy?: number | null
  /** Did the user just complete a step recently? */
  recentStepCompletion?: boolean
  /** User's display name */
  displayName?: string | null
  /** Memory signals for richer context */
  memorySignals?: GreetingMemorySignals
}

/**
 * Generates a warm, contextually aware opening message for milestone chat sessions.
 *
 * This is what transforms the milestone chat from "generic tool" to "cofounder who remembers."
 * Instead of "Let's get X done. What's the first thing you need to do?" every time,
 * the user gets a message that acknowledges where they left off, how they're feeling,
 * and what progress they've made.
 *
 * Like generatePersonalGreeting, this runs server-side with NO AI call — pure data synthesis.
 * The message gets injected as the initial assistant message in MilestoneModeChat.
 */
export function generateMilestoneOpener(signals: MilestoneOpenerSignals): {
  opener: string
  quickPrompts: string[]
} {
  const name = signals.displayName || 'there'
  const ms = signals.milestoneTitle

  // Default quick prompts — will be overridden below based on context
  let quickPrompts = [
    "Walk me through this step",
    "I'm stuck — help me think",
    "Break this down smaller",
    "What should I do first?",
  ]

  // ─── TIER 1: RETURNING TO AN ACTIVE CONVERSATION ───
  // They were talking in this milestone recently — create seamless continuity
  if (signals.lastMilestoneMessage && signals.lastMilestoneMessageHoursAgo != null) {
    const hoursAgo = signals.lastMilestoneMessageHoursAgo
    const truncated = signals.lastMilestoneMessage.length > 100
      ? signals.lastMilestoneMessage.slice(0, 97) + '...'
      : signals.lastMilestoneMessage

    // Very recent (same session, within a few hours)
    if (hoursAgo < 3) {
      quickPrompts = [
        "Continue where I left off",
        "I figured something out",
        "I'm still stuck on this",
        "Help me with the next part",
      ]
      if (signals.currentStepText) {
        return {
          opener: `Still on it. You're working through: **${signals.currentStepText}**\n\nPick up where you left off — what do you need?`,
          quickPrompts,
        }
      }
      return {
        opener: `Welcome back. You were just here — let's keep the momentum going on "${ms}".`,
        quickPrompts,
      }
    }

    // Yesterday or day before — weave in what they said
    if (hoursAgo >= 8 && hoursAgo < 48) {
      quickPrompts = [
        "Pick up where I left off",
        "I've made progress since then",
        "I'm stuck on something new",
        "Help me plan today's work",
      ]
      // They had a specific question or struggle last time
      if (/\?|stuck|help|confused|not sure|don't know/i.test(signals.lastMilestoneMessage)) {
        return {
          opener: `Last time you said: "${truncated}"\n\nHave you had any new thoughts on that, ${name}? I'm ready to dig in.`,
          quickPrompts,
        }
      }
      // They were making progress
      if (signals.currentStepText) {
        return {
          opener: `Hey ${name}. Yesterday you were working through "${ms}" — your next step is: **${signals.currentStepText}**\n\nReady to pick this up?`,
          quickPrompts,
        }
      }
      return {
        opener: `Welcome back to "${ms}", ${name}. Last time you said: "${truncated}"\n\nLet's build on that.`,
        quickPrompts,
      }
    }

    // Been a while (2+ days)
    if (hoursAgo >= 48) {
      const days = Math.round(hoursAgo / 24)
      quickPrompts = [
        "Pick up where I left off",
        "I want to start fresh",
        "Remind me where I was",
        "Help me get back on track",
      ]
      if (signals.currentStepText) {
        return {
          opener: `It's been ${days} days since we worked on "${ms}". No worries — your next step is still here: **${signals.currentStepText}**\n\nWhere do you want to start, ${name}?`,
          quickPrompts,
        }
      }
      return {
        opener: `It's been ${days} days, ${name}. "${ms}" is still here waiting. Last time you said: "${truncated}"\n\nWant to pick up where you left off, or start fresh?`,
        quickPrompts,
      }
    }
  }

  // ─── TIER 2: MOOD-AWARE OPENING ───
  // If we know they're having a rough day, adjust tone
  if (signals.currentMood != null && signals.currentMood <= 3) {
    quickPrompts = [
      "Just help me do one small thing",
      "What's the easiest win right now?",
      "Talk me through it gently",
      "I need a pep talk first",
    ]
    if (signals.currentStepText) {
      return {
        opener: `I know today's been heavy, ${name}. No pressure — but if you want to make a little progress, your next step is small: **${signals.currentStepText}**\n\nEven 5 minutes counts.`,
        quickPrompts,
      }
    }
    return {
      opener: `Not the easiest day, ${name}. But you're here — that says something. Let's see what we can do on "${ms}" without burning out.\n\nWhat feels manageable right now?`,
      quickPrompts,
    }
  }

  // If energy is low
  if (signals.currentEnergy != null && signals.currentEnergy <= 3) {
    quickPrompts = [
      "Give me the easiest thing to do",
      "Help me think — I'm too tired to plan",
      "What can I do in 10 minutes?",
      "Just walk me through it step by step",
    ]
    if (signals.currentStepText) {
      return {
        opener: `Low energy today? That's fine. Here's a small step you can knock out: **${signals.currentStepText}**\n\nOr tell me what's on your mind about "${ms}" and I'll help think through it.`,
        quickPrompts,
      }
    }
    return {
      opener: `Running low on energy, ${name}? Let's keep things light. What's the smallest thing we can move forward on "${ms}" today?`,
      quickPrompts,
    }
  }

  // If mood is great — match their energy
  if (signals.currentMood != null && signals.currentMood >= 8) {
    quickPrompts = [
      "Let's knock this step out",
      "I'm ready — what's the plan?",
      "Help me push through fast",
      "I want to finish this milestone today",
    ]
    if (signals.currentStepText) {
      return {
        opener: `You're in a good place today, ${name}. Let's use that energy — your next step on "${ms}": **${signals.currentStepText}**\n\nLet's go.`,
        quickPrompts,
      }
    }
    return {
      opener: `Good day to make progress, ${name}. Let's dive into "${ms}" — what are you thinking?`,
      quickPrompts,
    }
  }

  // ─── TIER 3: STEP-AWARE OPENING ───
  // We know their step progress — use it
  if (signals.completedSteps != null && signals.totalSteps != null && signals.totalSteps > 0) {
    const progress = signals.completedSteps / signals.totalSteps

    // Just getting started
    if (progress === 0 && signals.currentStepText) {
      quickPrompts = [
        "Walk me through this first step",
        "I don't know where to begin",
        "Break this step down smaller",
        "Do this step for me",
      ]
      return {
        opener: `Let's get "${ms}" started. Your first step: **${signals.currentStepText}**\n\nTell me what you're thinking, or if you're stuck, share what's blocking you and we'll figure it out, ${name}.`,
        quickPrompts,
      }
    }

    // More than half done
    if (progress >= 0.5 && progress < 1 && signals.currentStepText) {
      quickPrompts = [
        "Help me with this next step",
        "I'm stuck — break it down",
        "What's the fastest way to finish?",
        "Do this step for me",
      ]
      return {
        opener: `You're over halfway through "${ms}" — ${signals.completedSteps} of ${signals.totalSteps} steps done. Next up: **${signals.currentStepText}**\n\nThe finish line is getting closer, ${name}.`,
        quickPrompts,
      }
    }

    // Almost done
    if (progress >= 0.8 && signals.currentStepText) {
      const remaining = signals.totalSteps - signals.completedSteps
      quickPrompts = [
        "Let's finish this",
        "Walk me through what's left",
        "Do the remaining steps for me",
        "What do I need to wrap up?",
      ]
      return {
        opener: `Just ${remaining} step${remaining !== 1 ? 's' : ''} left on "${ms}". You're so close: **${signals.currentStepText}**\n\nLet's finish this, ${name}.`,
        quickPrompts,
      }
    }

    // Has current step, general case
    if (signals.currentStepText) {
      return {
        opener: `Working on "${ms}" — ${signals.completedSteps}/${signals.totalSteps} steps done. Your next move: **${signals.currentStepText}**\n\nReady to tackle this? Tell me what you're thinking, or if you're stuck, share what's blocking you.`,
        quickPrompts,
      }
    }
  }

  // ─── TIER 4: DEFAULT (still better than the old static template) ───
  if (signals.currentStepText) {
    return {
      opener: `Let's work on "${ms}", ${name}.\n\nYour current step: **${signals.currentStepText}**\n\nReady to tackle this? Tell me what you're thinking, or if you're stuck, share what's blocking you and we'll figure it out together.`,
      quickPrompts,
    }
  }

  quickPrompts = [
    "What should I do first?",
    "I don't know where to start",
    "Break this milestone into steps",
    "Tell me what this involves",
  ]

  return {
    opener: `Let's get "${ms}" done, ${name}.\n\n**What's the very first thing you need to do to make progress?**\n\nIf you're not sure, tell me what's on your mind and we'll figure it out together.`,
    quickPrompts,
  }
}

/**
 * Context signals for generating a memory-aware project chat (BuilderChat) opening.
 * Built from recent DB data without an AI call.
 */
export interface BuilderChatOpenerSignals {
  /** The project name */
  projectName: string
  /** Project status */
  projectStatus: string
  /** Active milestone title (if any) */
  activeMilestoneTitle?: string | null
  /** Number of milestones completed vs total */
  completedMilestones?: number
  totalMilestones?: number
  /** The user's last message in THIS project's chat */
  lastProjectMessage?: string | null
  /** Hours since their last message in this project */
  lastProjectMessageHoursAgo?: number | null
  /** The user's most recent daily log mood */
  currentMood?: number | null
  /** The user's most recent daily log energy */
  currentEnergy?: number | null
  /** User's display name */
  displayName?: string | null
  /** Memory signals for richer cross-conversation context */
  memorySignals?: GreetingMemorySignals
}

/**
 * Generates a warm, contextually aware opening message for project chat sessions.
 *
 * This is what transforms BuilderChat from "generic AI assistant" to "cofounder who
 * remembers what you've been working on." Instead of "AI Builder Ready — Ask me anything"
 * every time, the user gets a message that acknowledges where they left off, what milestone
 * they're tackling, and how they're feeling.
 *
 * Like generateMilestoneOpener, this runs server-side with NO AI call — pure data synthesis.
 */
export function generateBuilderChatOpener(signals: BuilderChatOpenerSignals): {
  opener: string
  quickPrompts: string[]
} {
  const name = signals.displayName || 'there'
  const proj = signals.projectName

  // Default quick prompts — will be overridden below based on context
  let quickPrompts = [
    "What should I work on next?",
    "Help me think through a decision",
    "I'm stuck — what's the smallest next step?",
    "Review my progress so far",
  ]

  // ─── TIER 1: RETURNING TO AN ACTIVE CONVERSATION ───
  if (signals.lastProjectMessage && signals.lastProjectMessageHoursAgo != null) {
    const hoursAgo = signals.lastProjectMessageHoursAgo
    const truncated = signals.lastProjectMessage.length > 100
      ? signals.lastProjectMessage.slice(0, 97) + '...'
      : signals.lastProjectMessage

    // Very recent (same session, within a few hours)
    if (hoursAgo < 3) {
      quickPrompts = [
        "Continue where we left off",
        "I have a follow-up question",
        "Let's switch to something else",
        "Help me with a different milestone",
      ]
      if (signals.activeMilestoneTitle) {
        return {
          opener: `Still working on "${proj}"? You were just here — let's keep going.\n\nYour active milestone is **${signals.activeMilestoneTitle}**. What do you need?`,
          quickPrompts,
        }
      }
      return {
        opener: `Welcome back. Let's keep the momentum going on "${proj}".`,
        quickPrompts,
      }
    }

    // Yesterday or day before — weave in what they said
    if (hoursAgo >= 8 && hoursAgo < 48) {
      quickPrompts = [
        "Pick up where we left off",
        "I've made progress since then",
        "I'm stuck on something new",
        "Let's plan today's work",
      ]
      if (/\?|stuck|help|confused|not sure|don't know/i.test(signals.lastProjectMessage)) {
        return {
          opener: `Last time you said: "${truncated}"\n\nHave you had any new thoughts on that, ${name}? I'm ready to dig in.`,
          quickPrompts,
        }
      }
      if (signals.activeMilestoneTitle) {
        return {
          opener: `Hey ${name}. Last session you were working on "${proj}" — your active milestone is **${signals.activeMilestoneTitle}**.\n\nReady to pick this up?`,
          quickPrompts,
        }
      }
      return {
        opener: `Welcome back to "${proj}", ${name}. Last time you said: "${truncated}"\n\nLet's build on that.`,
        quickPrompts,
      }
    }

    // Been a while (2+ days)
    if (hoursAgo >= 48) {
      const days = Math.round(hoursAgo / 24)
      quickPrompts = [
        "Pick up where I left off",
        "I want to start fresh",
        "What should I focus on?",
        "Help me get back on track",
      ]
      if (signals.activeMilestoneTitle) {
        return {
          opener: `It's been ${days} days since we worked on "${proj}". No worries — your active milestone is still here: **${signals.activeMilestoneTitle}**\n\nWhere do you want to start, ${name}?`,
          quickPrompts,
        }
      }
      return {
        opener: `It's been ${days} days, ${name}. "${proj}" is waiting for you. Last time you said: "${truncated}"\n\nWant to pick up where you left off, or start fresh?`,
        quickPrompts,
      }
    }
  }

  // ─── TIER 2: MOOD-AWARE OPENING ───
  if (signals.currentMood != null && signals.currentMood <= 3) {
    quickPrompts = [
      "Just help me do one small thing",
      "I need a confidence boost",
      "What's the easiest win right now?",
      "Talk me through what to do next",
    ]
    if (signals.activeMilestoneTitle) {
      return {
        opener: `I know today's been heavy, ${name}. No pressure — but if you want to make a little progress on "${proj}", your active milestone is: **${signals.activeMilestoneTitle}**\n\nEven 5 minutes counts.`,
        quickPrompts,
      }
    }
    return {
      opener: `Not the easiest day, ${name}. But you're here — that says something. Let's see what we can do on "${proj}" without burning out.\n\nWhat feels manageable right now?`,
      quickPrompts,
    }
  }

  if (signals.currentMood != null && signals.currentMood >= 8) {
    quickPrompts = [
      "Let's knock out something big today",
      "What's the most impactful thing I can do?",
      "Help me brainstorm new ideas",
      "Let's push toward launching",
    ]
    if (signals.activeMilestoneTitle) {
      return {
        opener: `You're in a good place today, ${name}. Let's use that energy on "${proj}" — your active milestone: **${signals.activeMilestoneTitle}**\n\nLet's make it count.`,
        quickPrompts,
      }
    }
    return {
      opener: `Good day to make progress, ${name}. Let's dive into "${proj}" — what are you thinking?`,
      quickPrompts,
    }
  }

  // ─── TIER 3: MILESTONE-AWARE OPENING ───
  if (signals.completedMilestones != null && signals.totalMilestones != null && signals.totalMilestones > 0) {
    const progress = signals.completedMilestones / signals.totalMilestones

    // Strong progress
    if (progress >= 0.5 && progress < 1 && signals.activeMilestoneTitle) {
      quickPrompts = [
        "Work on " + (signals.activeMilestoneTitle.length > 30 ? "my active milestone" : signals.activeMilestoneTitle),
        "What's the fastest path to launch?",
        "Help me prioritize what's left",
        "Review what I've accomplished",
      ]
      return {
        opener: `You're over halfway through "${proj}" — ${signals.completedMilestones} of ${signals.totalMilestones} milestones done. Your active focus: **${signals.activeMilestoneTitle}**\n\nThe finish line is getting closer, ${name}.`,
        quickPrompts,
      }
    }

    // Almost done
    if (progress >= 0.8 && signals.activeMilestoneTitle) {
      const remaining = signals.totalMilestones - signals.completedMilestones
      quickPrompts = [
        "Let's finish this",
        "Help me plan the launch",
        "What's blocking completion?",
        "Review everything before launch",
      ]
      return {
        opener: `Just ${remaining} milestone${remaining !== 1 ? 's' : ''} left on "${proj}". You're so close: **${signals.activeMilestoneTitle}**\n\nLet's finish this, ${name}.`,
        quickPrompts,
      }
    }

    // Has an active milestone, general case
    if (signals.activeMilestoneTitle) {
      quickPrompts = [
        "Work on " + (signals.activeMilestoneTitle.length > 30 ? "my active milestone" : signals.activeMilestoneTitle),
        "Help me break this down further",
        "I'm stuck — what's the smallest step?",
        "Let's brainstorm approaches",
      ]
      return {
        opener: `Let's work on "${proj}", ${name}. ${signals.completedMilestones}/${signals.totalMilestones} milestones done — your active focus: **${signals.activeMilestoneTitle}**\n\nWhat do you need?`,
        quickPrompts,
      }
    }
  }

  // ─── TIER 4: CROSS-CONVERSATION SIGNALS ───
  if (signals.memorySignals?.openLoops && signals.memorySignals.openLoops.length > 0) {
    const loop = signals.memorySignals.openLoops[0]
    const quoteMatch = loop.match(/"([^"]+)"/)
    if (quoteMatch && quoteMatch[1].length > 15 && quoteMatch[1].length < 120) {
      quickPrompts = [
        "Yes, let's follow through on that",
        "I've changed my mind about that",
        "Help me with something else first",
        "What should I prioritize?",
      ]
      return {
        opener: `Something from our recent conversations: "${quoteMatch[1]}"\n\nWant to follow through on that for "${proj}", ${name}?`,
        quickPrompts,
      }
    }
  }

  // ─── TIER 5: DEFAULT (still better than static) ───
  if (signals.activeMilestoneTitle) {
    quickPrompts = [
      "Work on " + (signals.activeMilestoneTitle.length > 30 ? "my active milestone" : signals.activeMilestoneTitle),
      "Help me break down this milestone",
      "I'm stuck — what's the smallest next step?",
      "Review my progress and suggest next steps",
    ]
    return {
      opener: `Let's build "${proj}", ${name}.\n\nYour active milestone: **${signals.activeMilestoneTitle}**\n\nWhat do you want to tackle?`,
      quickPrompts,
    }
  }

  return {
    opener: `I'm here to help you build **${proj}**, ${name}.\n\nWhat do you need — brainstorming, planning, coding, or something else?`,
    quickPrompts,
  }
}

/**
 * Fetches recent conversations from all sources and weaves them into
 * a unified memory context that makes Rise feel like one mind.
 */
export async function weaveMemory(
  client: SupabaseClient,
  userId: string,
  options: {
    /** Which source is asking (so we deprioritize its own messages) */
    currentSource?: 'path_finder' | 'milestone_mode' | 'project_chat' | 'morning_briefing' | 'evening_reflection' | 'morning_checkin'
    /** Current project ID for relevance weighting */
    projectId?: string
    /** Max messages to fetch per source (default: 20) */
    maxPerSource?: number
    /** How many days back to look (default: 7) */
    lookbackDays?: number
  } = {}
): Promise<WovenMemory> {
  const {
    currentSource,
    projectId,
    maxPerSource = 20,
    lookbackDays = 7,
  } = options

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = client as any

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays)
  const cutoffISO = cutoffDate.toISOString()

  // Fetch from all conversation sources in parallel
  const [pathFinderResult, milestoneResult, projectChatResult, insightsResult, dailyLogsResult] = await Promise.all([
    // Path Finder messages (most recent conversations)
    fetchPathFinderMessages(supabase, userId, cutoffISO, maxPerSource),

    // Milestone Mode messages
    fetchMilestoneMessages(supabase, userId, cutoffISO, maxPerSource),

    // Project Chat messages
    fetchProjectChatMessages(supabase, userId, cutoffISO, maxPerSource, projectId),

    // Recent AI insights (high importance only)
    supabase
      .from('ai_insights')
      .select('insight_type, content, importance, source_ai, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('importance', 6)
      .gte('created_at', cutoffISO)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(15),

    // Recent daily logs for emotional context
    supabase
      .from('daily_logs')
      .select('log_date, morning_mood, morning_energy, evening_mood, evening_energy, day_rating, gratitude_entry, reflection_notes')
      .eq('user_id', userId)
      .gte('log_date', cutoffDate.toISOString().split('T')[0])
      .order('log_date', { ascending: false })
      .limit(7),
  ])

  const threads: ConversationThread[] = []

  // Process Path Finder messages
  if (pathFinderResult.messages.length > 0) {
    threads.push({
      source: 'path_finder',
      messages: pathFinderResult.messages,
      projectName: pathFinderResult.projectName || undefined,
    })
  }

  // Process Milestone messages
  for (const thread of milestoneResult) {
    threads.push({
      source: 'milestone_mode',
      messages: thread.messages,
      projectName: thread.projectName,
      milestoneTitle: thread.milestoneTitle,
    })
  }

  // Process Project Chat messages
  for (const thread of projectChatResult) {
    threads.push({
      source: 'project_chat',
      messages: thread.messages,
      projectName: thread.projectName,
    })
  }

  const insights = (insightsResult.data || []) as Array<{
    insight_type: string
    content: string
    importance: number
    source_ai: string
    created_at: string
  }>

  const dailyLogs = (dailyLogsResult.data || []) as Array<{
    log_date: string
    morning_mood: number | null
    morning_energy: number | null
    evening_mood: number | null
    evening_energy: number | null
    day_rating: number | null
    gratitude_entry: string | null
    reflection_notes: string | null
  }>

  // Build the memory snapshot
  const snapshot: MemorySnapshot = {
    recentThreads: threads,
    emotionalArc: buildEmotionalArc(dailyLogs),
    openLoops: extractOpenLoops(threads),
    recurringThemes: extractRecurringThemes(threads, insights),
    lastSessionSummary: buildLastSessionSummary(threads, currentSource),
  }

  // Weave everything into a unified context
  return weaveIntoContext(snapshot, currentSource, insights)
}

// ───────────────────────────────────────────
// Data Fetchers
// ───────────────────────────────────────────

async function fetchPathFinderMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  cutoffISO: string,
  limit: number
): Promise<{ messages: { role: string; content: string; created_at: string }[]; projectName?: string }> {
  try {
    // Get the most recent active conversation
    const { data: conversations } = await supabase
      .from('path_finder_conversations')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (!conversations || conversations.length === 0) {
      return { messages: [] }
    }

    const { data: messages } = await supabase
      .from('path_finder_messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversations[0].id)
      .eq('user_id', userId)
      .gte('created_at', cutoffISO)
      .order('created_at', { ascending: false })
      .limit(limit)

    return {
      messages: (messages || []).reverse(),
    }
  } catch {
    return { messages: [] }
  }
}

async function fetchMilestoneMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  cutoffISO: string,
  limit: number
): Promise<Array<{ messages: { role: string; content: string; created_at: string }[]; projectName: string; milestoneTitle: string }>> {
  try {
    // Get recent milestone conversations with their milestone and project info
    const { data: conversations } = await supabase
      .from('milestone_conversations')
      .select('id, milestone_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(3) // Last 3 milestone conversations

    if (!conversations || conversations.length === 0) return []

    const results: Array<{ messages: { role: string; content: string; created_at: string }[]; projectName: string; milestoneTitle: string }> = []

    for (const conv of conversations) {
      // Fetch messages
      const { data: messages } = await supabase
        .from('milestone_messages')
        .select('role, content, created_at')
        .eq('conversation_id', conv.id)
        .eq('user_id', userId)
        .gte('created_at', cutoffISO)
        .order('created_at', { ascending: false })
        .limit(Math.floor(limit / 2)) // Split limit across conversations

      if (!messages || messages.length === 0) continue

      // Fetch milestone + project info
      const { data: milestone } = await supabase
        .from('milestones')
        .select('title, project_id')
        .eq('id', conv.milestone_id)
        .single()

      let projectName = 'Unknown project'
      if (milestone?.project_id) {
        const { data: project } = await supabase
          .from('projects')
          .select('name')
          .eq('id', milestone.project_id)
          .single()
        projectName = project?.name || 'Unknown project'
      }

      results.push({
        messages: (messages || []).reverse(),
        projectName,
        milestoneTitle: milestone?.title || 'Unknown milestone',
      })
    }

    return results
  } catch {
    return []
  }
}

async function fetchProjectChatMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  cutoffISO: string,
  limit: number,
  focusProjectId?: string
): Promise<Array<{ messages: { role: string; content: string; created_at: string }[]; projectName: string }>> {
  try {
    // Get recent project IDs that have chat messages
    let query = supabase
      .from('project_logs')
      .select('project_id, content, role, created_at')
      .eq('user_id', userId)
      .gte('created_at', cutoffISO)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (focusProjectId) {
      // Prioritize the current project but include others
      query = query.order('created_at', { ascending: false })
    }

    const { data: logs } = await query

    if (!logs || logs.length === 0) return []

    // Group by project
    const byProject: Record<string, { role: string; content: string; created_at: string }[]> = {}
    for (const log of logs) {
      if (!byProject[log.project_id]) byProject[log.project_id] = []
      byProject[log.project_id].push({
        role: log.role,
        content: log.content,
        created_at: log.created_at,
      })
    }

    const results: Array<{ messages: { role: string; content: string; created_at: string }[]; projectName: string }> = []

    for (const [pid, messages] of Object.entries(byProject)) {
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', pid)
        .single()

      results.push({
        messages: messages.reverse(),
        projectName: project?.name || 'Unknown project',
      })
    }

    return results
  } catch {
    return []
  }
}

// ───────────────────────────────────────────
// Analysis Functions
// ───────────────────────────────────────────

function buildEmotionalArc(
  dailyLogs: Array<{
    log_date: string
    morning_mood: number | null
    morning_energy: number | null
    evening_mood: number | null
    evening_energy: number | null
    day_rating: number | null
    gratitude_entry: string | null
    reflection_notes: string | null
  }>
): string | null {
  if (dailyLogs.length === 0) return null

  const parts: string[] = []

  // Recent mood trend
  const moods = dailyLogs
    .filter(l => l.morning_mood || l.evening_mood)
    .map(l => ({
      date: l.log_date,
      morning: l.morning_mood,
      evening: l.evening_mood,
      rating: l.day_rating,
    }))

  if (moods.length >= 2) {
    const recent = moods[0]
    const earlier = moods[moods.length - 1]
    const recentAvg = ((recent.morning || 5) + (recent.evening || 5)) / 2
    const earlierAvg = ((earlier.morning || 5) + (earlier.evening || 5)) / 2

    if (recentAvg > earlierAvg + 1) {
      parts.push('Mood has been trending upward recently')
    } else if (recentAvg < earlierAvg - 1) {
      parts.push('Mood has been dipping recently')
    } else {
      parts.push('Mood has been steady')
    }
  }

  // Energy pattern
  const energyLogs = dailyLogs.filter(l => l.morning_energy || l.evening_energy)
  if (energyLogs.length > 0) {
    const avgEnergy = energyLogs.reduce((sum, l) => {
      const morning = l.morning_energy || 5
      const evening = l.evening_energy || 5
      return sum + (morning + evening) / 2
    }, 0) / energyLogs.length

    if (avgEnergy >= 7) parts.push('energy levels have been high')
    else if (avgEnergy <= 4) parts.push('energy has been low')
  }

  // Gratitude/reflection presence
  const hasGratitude = dailyLogs.some(l => l.gratitude_entry)
  const hasReflection = dailyLogs.some(l => l.reflection_notes)
  if (hasGratitude) parts.push('has been practicing gratitude')
  if (hasReflection) parts.push('has been reflecting on their days')

  if (parts.length === 0) return null
  return parts.join('. ') + '.'
}

function extractOpenLoops(threads: ConversationThread[]): string[] {
  const loops: string[] = []

  for (const thread of threads) {
    const userMessages = thread.messages.filter(m => m.role === 'user')

    for (const msg of userMessages) {
      const content = msg.content.toLowerCase()

      // Detect commitments
      if (content.match(/i('ll| will| should| need to| want to| plan to| going to)\s/)) {
        // Extract the commitment (first 100 chars of the sentence)
        const sentences = msg.content.split(/[.!?]+/)
        for (const sentence of sentences) {
          if (sentence.toLowerCase().match(/i('ll| will| should| need to| want to| plan to| going to)\s/)) {
            const trimmed = sentence.trim()
            if (trimmed.length > 10 && trimmed.length < 200) {
              loops.push(`[${thread.source}] "${trimmed}"`)
            }
            break
          }
        }
      }

      // Detect questions/uncertainties
      if (content.match(/(not sure|don't know|confused about|struggling with|worried about)/)) {
        const sentences = msg.content.split(/[.!?]+/)
        for (const sentence of sentences) {
          if (sentence.toLowerCase().match(/(not sure|don't know|confused about|struggling with|worried about)/)) {
            const trimmed = sentence.trim()
            if (trimmed.length > 10 && trimmed.length < 200) {
              loops.push(`[${thread.source}] "${trimmed}"`)
            }
            break
          }
        }
      }
    }
  }

  // Deduplicate similar loops and limit
  return loops.slice(0, 8)
}

function extractRecurringThemes(
  threads: ConversationThread[],
  insights: Array<{ insight_type: string; content: string; source_ai: string }>
): string[] {
  const themes: Record<string, number> = {}

  // Count topic mentions across threads
  const topicPatterns: Record<string, RegExp> = {
    'pricing/monetization': /pric(e|ing)|monetiz|revenue|charge|subscription|free|paid/i,
    'launch anxiety': /launch|ship|release|go live|not ready|perfect/i,
    'technical decisions': /tech stack|framework|database|api|architecture/i,
    'audience/users': /audience|user|customer|target|market|who.*for/i,
    'design/ux': /design|ux|ui|layout|brand|visual|look.*feel/i,
    'content creation': /content|write|blog|video|social media|post/i,
    'time/energy management': /time|busy|overwhelm|energy|focus|priorit/i,
    'confidence/doubt': /confiden|doubt|imposter|good enough|can i|ability/i,
  }

  for (const thread of threads) {
    const allText = thread.messages.map(m => m.content).join(' ')
    for (const [theme, pattern] of Object.entries(topicPatterns)) {
      const matches = allText.match(new RegExp(pattern, 'gi'))
      if (matches && matches.length > 0) {
        themes[theme] = (themes[theme] || 0) + matches.length
      }
    }
  }

  // Also count from insights
  for (const insight of insights) {
    for (const [theme, pattern] of Object.entries(topicPatterns)) {
      if (pattern.test(insight.content)) {
        themes[theme] = (themes[theme] || 0) + 2 // Weight insights more
      }
    }
  }

  // Return themes mentioned across MULTIPLE sources (cross-thread themes)
  return Object.entries(themes)
    .filter(([, count]) => count >= 3) // At least 3 mentions
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([theme]) => theme)
}

function buildLastSessionSummary(
  threads: ConversationThread[],
  currentSource?: string
): string | null {
  // Find the most recent thread that ISN'T from the current source
  const otherThreads = currentSource
    ? threads.filter(t => t.source !== currentSource)
    : threads

  if (otherThreads.length === 0) return null

  // Sort by most recent message
  const sorted = [...otherThreads].sort((a, b) => {
    const aLast = a.messages[a.messages.length - 1]?.created_at || ''
    const bLast = b.messages[b.messages.length - 1]?.created_at || ''
    return bLast.localeCompare(aLast)
  })

  const lastThread = sorted[0]
  if (!lastThread || lastThread.messages.length === 0) return null

  // Get the last few messages as context
  const recentMessages = lastThread.messages.slice(-4)
  const userMessages = recentMessages.filter(m => m.role === 'user')
  const lastUserMessage = userMessages[userMessages.length - 1]

  if (!lastUserMessage) return null

  const sourceLabel = {
    path_finder: 'Path Finder',
    milestone_mode: 'Milestone Mode',
    project_chat: 'Project Chat',
  }[lastThread.source] || lastThread.source

  const contextParts: string[] = []
  contextParts.push(`Last conversation was in ${sourceLabel}`)
  if (lastThread.projectName) contextParts.push(`about "${lastThread.projectName}"`)
  if (lastThread.milestoneTitle) contextParts.push(`working on "${lastThread.milestoneTitle}"`)

  // Summarize what the user was talking about (truncate long messages)
  const lastContent = lastUserMessage.content.length > 200
    ? lastUserMessage.content.slice(0, 200) + '...'
    : lastUserMessage.content
  contextParts.push(`The user last said: "${lastContent}"`)

  // How long ago
  const lastTime = new Date(lastUserMessage.created_at)
  const now = new Date()
  const hoursAgo = Math.round((now.getTime() - lastTime.getTime()) / (1000 * 60 * 60))
  if (hoursAgo < 1) contextParts.push('(within the last hour)')
  else if (hoursAgo < 24) contextParts.push(`(${hoursAgo} hours ago)`)
  else contextParts.push(`(${Math.round(hoursAgo / 24)} days ago)`)

  return contextParts.join('. ')
}

// ───────────────────────────────────────────
// Context Assembly
// ───────────────────────────────────────────

function weaveIntoContext(
  snapshot: MemorySnapshot,
  currentSource: string | undefined,
  insights: Array<{ insight_type: string; content: string; importance: number; source_ai: string }>
): WovenMemory {
  const sections: string[] = []
  let hasCrossThread = false

  // 1. Last Session Context (creates continuity)
  if (snapshot.lastSessionSummary) {
    sections.push(`### Last Conversation\n${snapshot.lastSessionSummary}`)
    hasCrossThread = true
  }

  // 2. Cross-Thread Conversation Highlights
  const otherThreads = currentSource
    ? snapshot.recentThreads.filter(t => t.source !== currentSource)
    : snapshot.recentThreads

  if (otherThreads.length > 0) {
    const highlights: string[] = []
    for (const thread of otherThreads.slice(0, 3)) {
      const sourceLabel = {
        path_finder: 'Path Finder',
        milestone_mode: 'Milestone Mode',
        project_chat: 'Project Chat',
      }[thread.source] || thread.source

      // Extract meaningful user quotes
      const userMsgs = thread.messages.filter(m => m.role === 'user')
      if (userMsgs.length > 0) {
        const lastMsg = userMsgs[userMsgs.length - 1]
        const preview = lastMsg.content.length > 150
          ? lastMsg.content.slice(0, 150) + '...'
          : lastMsg.content
        const context = thread.milestoneTitle
          ? ` (milestone: "${thread.milestoneTitle}")`
          : thread.projectName
          ? ` (project: "${thread.projectName}")`
          : ''
        highlights.push(`- In ${sourceLabel}${context}: "${preview}"`)
      }
    }

    if (highlights.length > 0) {
      sections.push(`### What They've Been Saying Elsewhere\n${highlights.join('\n')}`)
      hasCrossThread = true
    }
  }

  // 3. Emotional Arc
  if (snapshot.emotionalArc) {
    sections.push(`### Emotional State\n${snapshot.emotionalArc}`)
  }

  // 4. Open Loops (things the user committed to or is uncertain about)
  if (snapshot.openLoops.length > 0) {
    sections.push(`### Open Loops (unresolved commitments/concerns)\n${snapshot.openLoops.map(l => `- ${l}`).join('\n')}`)
  }

  // 5. Recurring Themes (topics that keep coming up across conversations)
  if (snapshot.recurringThemes.length > 0) {
    sections.push(`### Recurring Themes\nTopics that keep coming up: ${snapshot.recurringThemes.join(', ')}`)
    if (snapshot.recurringThemes.length >= 2) hasCrossThread = true
  }

  // 6. Recent High-Importance Insights
  const crossSourceInsights = currentSource
    ? insights.filter(i => i.source_ai !== currentSource)
    : insights

  if (crossSourceInsights.length > 0) {
    const insightLines = crossSourceInsights.slice(0, 5).map(i => {
      const sourceLabel = {
        path_finder: 'Path Finder',
        milestone_mode: 'Milestone Mode',
        project_chat: 'Chat',
      }[i.source_ai] || i.source_ai
      return `- [from ${sourceLabel}] ${i.content}`
    })
    sections.push(`### Insights Discovered in Other Conversations\n${insightLines.join('\n')}`)
    hasCrossThread = true
  }

  if (sections.length === 0) {
    return {
      contextBlock: '',
      briefSummary: '',
      sourceCount: 0,
      hasCrossThreadInsights: false,
    }
  }

  const contextBlock = `## Rise Memory (You Are ONE Mind)
You are Rise - a single consciousness that remembers ALL conversations with this user.
When you reference something from another conversation, do it naturally:
- "I remember you mentioned..." or "Earlier when we talked about..."
- "That connects to what you said about..."
- Don't say "in Path Finder" or "in Milestone Mode" - just reference it naturally as if you remember.

${sections.join('\n\n')}`

  // Build brief summary for token-constrained contexts
  const briefParts: string[] = []
  if (snapshot.lastSessionSummary) {
    briefParts.push(snapshot.lastSessionSummary.split('.')[0])
  }
  if (snapshot.recurringThemes.length > 0) {
    briefParts.push(`Recurring themes: ${snapshot.recurringThemes.slice(0, 3).join(', ')}`)
  }
  if (snapshot.emotionalArc) {
    briefParts.push(snapshot.emotionalArc.split('.')[0])
  }

  return {
    contextBlock,
    briefSummary: briefParts.join('. '),
    sourceCount: snapshot.recentThreads.length,
    hasCrossThreadInsights: hasCrossThread,
  }
}

// ───────────────────────────────────────────
// User Thread — Rise's Understanding of WHO You Are
// ───────────────────────────────────────────

/**
 * The User Thread is Rise's living portrait of who the user is as a person.
 * It goes beyond memory (what happened) into understanding (who they are).
 *
 * Memory says: "You mentioned pricing anxiety yesterday"
 * User Thread says: "You tend to overthink pricing because deep down you're
 *   worried about being judged — but once you commit, you execute fast"
 *
 * This is the difference between an AI that remembers and an AI that GETS you.
 *
 * Synthesized purely from existing data (no AI call, no schema changes):
 * - user_profile_facts (explicit user info)
 * - daily_logs (emotional patterns over time)
 * - ai_insights (accumulated observations from all AI interactions)
 * - conversation threads (communication style, recurring concerns)
 * - milestone progress (work patterns, pace, consistency)
 */

export interface UserThread {
  /** The full formatted block for system prompts */
  threadBlock: string
  /** Whether we have enough data to build a meaningful thread */
  hasMeaningfulData: boolean
  /** How many data sources contributed */
  sourceCount: number
}

interface EmotionalPattern {
  label: string
  detail: string
}

interface WorkStyle {
  label: string
  detail: string
}

/**
 * Synthesizes a User Thread — Rise's deep understanding of who this person is.
 *
 * This pulls from ALL available data sources and distills them into a
 * personality/behavioral model that makes every AI interaction feel personal.
 *
 * Designed to be called once per API request and injected into the system prompt.
 * All data comes from existing tables — no schema changes needed.
 */
export async function synthesizeUserThread(
  client: SupabaseClient,
  userId: string,
  options: {
    /** Include work patterns from milestone data (slightly more DB queries) */
    includeWorkPatterns?: boolean
    /** How many days of daily logs to analyze */
    lookbackDays?: number
  } = {}
): Promise<UserThread> {
  const {
    includeWorkPatterns = true,
    lookbackDays = 14,
  } = options

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = client as any

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays)

  // Fetch all data sources in parallel
  const [factsResult, logsResult, insightsResult, milestonesResult] = await Promise.all([
    // User profile facts (explicit info they've shared)
    supabase
      .from('user_profile_facts')
      .select('category, fact')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('category'),

    // Daily logs for emotional/energy patterns
    supabase
      .from('daily_logs')
      .select('log_date, morning_mood, morning_energy, evening_mood, evening_energy, day_rating, gratitude_entry, reflection_notes')
      .eq('user_id', userId)
      .gte('log_date', cutoffDate.toISOString().split('T')[0])
      .order('log_date', { ascending: false })
      .limit(lookbackDays),

    // AI insights accumulated over time (the AI's own observations)
    supabase
      .from('ai_insights')
      .select('insight_type, content, importance, source_ai, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('importance', 5)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30),

    // Milestone completion data for work patterns
    includeWorkPatterns
      ? supabase
          .from('milestones')
          .select('title, status, completed_at, created_at, updated_at')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ])

  const facts = (factsResult.data || []) as Array<{ category: string; fact: string }>
  const logs = (logsResult.data || []) as Array<{
    log_date: string
    morning_mood: number | null
    morning_energy: number | null
    evening_mood: number | null
    evening_energy: number | null
    day_rating: number | null
    gratitude_entry: string | null
    reflection_notes: string | null
  }>
  const insights = (insightsResult.data || []) as Array<{
    insight_type: string
    content: string
    importance: number
    source_ai: string
    created_at: string
  }>
  const milestones = (milestonesResult.data || []) as Array<{
    title: string
    status: string
    completed_at: string | null
    created_at: string
    updated_at: string
  }>

  let sourceCount = 0
  const sections: string[] = []

  // ─── 1. WHO THEY ARE (from profile facts) ───
  const identity = buildIdentitySection(facts)
  if (identity) {
    sections.push(identity)
    sourceCount++
  }

  // ─── 2. EMOTIONAL PATTERNS (from daily logs) ───
  const emotionalPatterns = analyzeEmotionalPatterns(logs)
  if (emotionalPatterns.length > 0) {
    const patternLines = emotionalPatterns.map(p => `- **${p.label}:** ${p.detail}`)
    sections.push(`### Emotional Patterns\n${patternLines.join('\n')}`)
    sourceCount++
  }

  // ─── 3. WHAT DRIVES & BLOCKS THEM (from insights) ───
  const driversAndBlockers = synthesizeDriversAndBlockers(insights)
  if (driversAndBlockers) {
    sections.push(driversAndBlockers)
    sourceCount++
  }

  // ─── 4. HOW THEY WORK (from milestone data) ───
  if (includeWorkPatterns) {
    const workStyle = analyzeWorkStyle(milestones, logs)
    if (workStyle.length > 0) {
      const styleLines = workStyle.map(s => `- **${s.label}:** ${s.detail}`)
      sections.push(`### How They Work\n${styleLines.join('\n')}`)
      sourceCount++
    }
  }

  // ─── 5. HOW TO TALK TO THEM (synthesized from everything) ───
  const commStyle = inferCommunicationGuidance(facts, insights, logs)
  if (commStyle) {
    sections.push(commStyle)
    sourceCount++
  }

  if (sections.length === 0) {
    return {
      threadBlock: '',
      hasMeaningfulData: false,
      sourceCount: 0,
    }
  }

  const threadBlock = `## User Thread (Who This Person IS)
You don't just remember what they said — you understand who they are.
Use this to adapt your tone, pacing, level of detail, and emotional awareness.
Never quote this section directly — just let it shape how you show up.

${sections.join('\n\n')}`

  return {
    threadBlock,
    hasMeaningfulData: sections.length >= 2,
    sourceCount,
  }
}

// ───────────────────────────────────────────
// User Thread Analysis Functions
// ───────────────────────────────────────────

function buildIdentitySection(
  facts: Array<{ category: string; fact: string }>
): string | null {
  if (facts.length === 0) return null

  const grouped: Record<string, string[]> = {}
  for (const f of facts) {
    if (!grouped[f.category]) grouped[f.category] = []
    grouped[f.category].push(f.fact)
  }

  const parts: string[] = []

  // Distill into a narrative rather than a list
  if (grouped['background']?.length) {
    parts.push(`Background: ${grouped['background'].join('. ')}`)
  }
  if (grouped['skills']?.length) {
    parts.push(`Strengths: ${grouped['skills'].join(', ')}`)
  }
  if (grouped['goals']?.length) {
    parts.push(`Driving toward: ${grouped['goals'].join('. ')}`)
  }
  if (grouped['constraints']?.length) {
    parts.push(`Real-world constraints: ${grouped['constraints'].join('. ')}`)
  }
  if (grouped['situation']?.length) {
    parts.push(`Current situation: ${grouped['situation'].join('. ')}`)
  }
  if (grouped['preferences']?.length) {
    parts.push(`Preferences: ${grouped['preferences'].join('. ')}`)
  }

  if (parts.length === 0) return null
  return `### Who They Are\n${parts.map(p => `- ${p}`).join('\n')}`
}

function analyzeEmotionalPatterns(
  logs: Array<{
    log_date: string
    morning_mood: number | null
    morning_energy: number | null
    evening_mood: number | null
    evening_energy: number | null
    day_rating: number | null
    gratitude_entry: string | null
    reflection_notes: string | null
  }>
): EmotionalPattern[] {
  if (logs.length < 3) return []

  const patterns: EmotionalPattern[] = []

  // Analyze mood volatility vs stability
  const moods = logs
    .filter(l => l.morning_mood != null || l.evening_mood != null)
    .map(l => (l.morning_mood || 5) + (l.evening_mood || 5))
    .map(sum => sum / 2)

  if (moods.length >= 3) {
    const avg = moods.reduce((a, b) => a + b, 0) / moods.length
    const variance = moods.reduce((sum, m) => sum + Math.pow(m - avg, 2), 0) / moods.length

    if (variance > 4) {
      patterns.push({
        label: 'Emotional range',
        detail: 'Their mood varies significantly day to day. Be ready to match their energy — high days want momentum, low days need gentleness.',
      })
    } else if (avg >= 7) {
      patterns.push({
        label: 'Generally positive',
        detail: 'They tend to feel good most days. Match their energy — be direct, ambitious, and forward-moving.',
      })
    } else if (avg <= 4) {
      patterns.push({
        label: 'Going through a tough stretch',
        detail: 'Recent moods have been low. Lead with empathy. Smaller steps. More encouragement. Less pressure.',
      })
    } else {
      patterns.push({
        label: 'Steady',
        detail: 'Their mood is fairly stable and moderate. They likely appreciate consistency and calm guidance.',
      })
    }
  }

  // Analyze morning-to-evening patterns (do they rally or fade?)
  const dayArcs = logs.filter(l => l.morning_mood != null && l.evening_mood != null)
  if (dayArcs.length >= 3) {
    const rallies = dayArcs.filter(l => (l.evening_mood!) > (l.morning_mood!) + 1).length
    const fades = dayArcs.filter(l => (l.evening_mood!) < (l.morning_mood!) - 1).length

    if (rallies > fades && rallies >= 2) {
      patterns.push({
        label: 'Slow starter',
        detail: 'They tend to feel worse in the morning but rally as the day goes on. Mornings may need a gentler push.',
      })
    } else if (fades > rallies && fades >= 2) {
      patterns.push({
        label: 'Morning person',
        detail: 'Their energy tends to fade through the day. Front-load important work suggestions to earlier in the day.',
      })
    }
  }

  // Energy patterns
  const energies = logs
    .filter(l => l.morning_energy != null || l.evening_energy != null)
    .map(l => ((l.morning_energy || 5) + (l.evening_energy || 5)) / 2)

  if (energies.length >= 3) {
    const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length
    if (avgEnergy <= 4) {
      patterns.push({
        label: 'Low energy lately',
        detail: 'Energy has been low. Keep tasks bite-sized. Celebrate small wins. Don\'t pile on.',
      })
    } else if (avgEnergy >= 7.5) {
      patterns.push({
        label: 'High energy',
        detail: 'Energy levels are strong. They can handle ambitious tasks and longer work sessions.',
      })
    }
  }

  // Self-reflection tendency
  const hasGratitude = logs.filter(l => l.gratitude_entry).length
  const hasReflection = logs.filter(l => l.reflection_notes).length
  if (hasGratitude >= 3 || hasReflection >= 3) {
    patterns.push({
      label: 'Self-aware',
      detail: 'They regularly practice gratitude or reflection. They respond well to deeper questions and meaning-making.',
    })
  }

  return patterns
}

function synthesizeDriversAndBlockers(
  insights: Array<{
    insight_type: string
    content: string
    importance: number
    source_ai: string
  }>
): string | null {
  if (insights.length === 0) return null

  const parts: string[] = []

  // What drives them (preferences, positive discoveries)
  const drivers = insights
    .filter(i => i.insight_type === 'preference' || i.insight_type === 'discovery')
    .slice(0, 5)

  if (drivers.length > 0) {
    const driverLines = drivers.map(d => `- ${d.content}`)
    parts.push(`**What drives them:**\n${driverLines.join('\n')}`)
  }

  // What blocks them (blockers, concerns)
  const blockers = insights
    .filter(i => i.insight_type === 'blocker')
    .slice(0, 4)

  if (blockers.length > 0) {
    const blockerLines = blockers.map(b => `- ${b.content}`)
    parts.push(`**What holds them back:**\n${blockerLines.join('\n')}`)
  }

  // Key decisions (shows how they think)
  const decisions = insights
    .filter(i => i.insight_type === 'decision')
    .slice(0, 3)

  if (decisions.length > 0) {
    const decisionLines = decisions.map(d => `- ${d.content}`)
    parts.push(`**Key decisions they've made:**\n${decisionLines.join('\n')}`)
  }

  if (parts.length === 0) return null
  return `### What Drives & Blocks Them\n${parts.join('\n')}`
}

function analyzeWorkStyle(
  milestones: Array<{
    title: string
    status: string
    completed_at: string | null
    created_at: string
    updated_at: string
  }>,
  logs: Array<{
    log_date: string
    day_rating: number | null
  }>
): WorkStyle[] {
  if (milestones.length < 2) return []

  const styles: WorkStyle[] = []

  const completed = milestones.filter(m => m.status === 'completed' && m.completed_at)
  const inProgress = milestones.filter(m => m.status === 'in_progress' || m.status === 'pending')

  // Completion rate
  if (milestones.length >= 4) {
    const completionRate = completed.length / milestones.length
    if (completionRate >= 0.6) {
      styles.push({
        label: 'Finisher',
        detail: 'They complete what they start. Once committed, they follow through. Lean into their momentum.',
      })
    } else if (completionRate <= 0.2 && inProgress.length >= 3) {
      styles.push({
        label: 'Starter',
        detail: 'They start enthusiastically but may struggle to finish. Help them stay focused on one thing at a time.',
      })
    }
  }

  // Speed patterns (how fast do they complete milestones?)
  if (completed.length >= 2) {
    const durations = completed
      .filter(m => m.completed_at && m.created_at)
      .map(m => {
        const created = new Date(m.created_at).getTime()
        const done = new Date(m.completed_at!).getTime()
        return (done - created) / (1000 * 60 * 60 * 24) // days
      })
      .filter(d => d > 0 && d < 365)

    if (durations.length >= 2) {
      const avgDays = durations.reduce((a, b) => a + b, 0) / durations.length
      if (avgDays <= 3) {
        styles.push({
          label: 'Fast mover',
          detail: 'They blitz through milestones quickly. Give them ambitious targets — they can handle the pace.',
        })
      } else if (avgDays >= 14) {
        styles.push({
          label: 'Deliberate',
          detail: 'They take their time with milestones. This isn\'t slowness — it may be thoroughness. Don\'t rush them.',
        })
      }
    }
  }

  // Consistency (do they work regularly or in bursts?)
  if (logs.length >= 7) {
    const ratedDays = logs.filter(l => l.day_rating != null).length
    const loggedDays = logs.length

    if (ratedDays >= loggedDays * 0.7) {
      styles.push({
        label: 'Consistent',
        detail: 'They show up regularly and track their progress. Build on this reliability with steady, incremental goals.',
      })
    } else if (ratedDays <= loggedDays * 0.3 && loggedDays >= 7) {
      styles.push({
        label: 'Burst worker',
        detail: 'They engage in bursts rather than daily consistency. Don\'t guilt them about gaps — help them maximize their on-days.',
      })
    }
  }

  return styles
}

function inferCommunicationGuidance(
  facts: Array<{ category: string; fact: string }>,
  insights: Array<{ insight_type: string; content: string; importance: number }>,
  logs: Array<{ day_rating: number | null; gratitude_entry: string | null; reflection_notes: string | null }>
): string | null {
  const guidelines: string[] = []

  // Check preferences for communication cues
  const prefFacts = facts.filter(f => f.category === 'preferences')
  const allText = [...prefFacts.map(f => f.fact), ...insights.map(i => i.content)].join(' ').toLowerCase()

  // Detect communication preferences from accumulated data
  if (/direct|blunt|straight|no.?bs|concise/i.test(allText)) {
    guidelines.push('They prefer direct, no-BS communication. Skip the fluff.')
  }
  if (/visual|diagram|example|show me/i.test(allText)) {
    guidelines.push('They learn better with examples and visuals. Show, don\'t just tell.')
  }
  if (/overwhelm|anxious|stress|too much/i.test(allText)) {
    guidelines.push('They can get overwhelmed. Break things into smaller pieces. One thing at a time.')
  }
  if (/detail|thorough|explain|why/i.test(allText)) {
    guidelines.push('They want to understand the "why". Don\'t just give answers — explain the reasoning.')
  }

  // If they're reflective, they probably want depth
  const reflectiveLogs = logs.filter(l => l.reflection_notes || l.gratitude_entry).length
  if (reflectiveLogs >= 3 && guidelines.length === 0) {
    guidelines.push('They\'re introspective. Don\'t just give surface-level help — engage with the deeper question behind the question.')
  }

  // Check for blockers about confidence/doubt
  const confidenceInsights = insights.filter(i =>
    /confiden|doubt|imposter|scared|afraid|nervous|worried/i.test(i.content)
  )
  if (confidenceInsights.length >= 1) {
    guidelines.push('They struggle with confidence. Normalize their experience. Remind them how far they\'ve come.')
  }

  if (guidelines.length === 0) return null
  return `### How to Show Up For Them\n${guidelines.map(g => `- ${g}`).join('\n')}`
}
