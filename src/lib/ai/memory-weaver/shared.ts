import type { SupabaseClient } from '@supabase/supabase-js'
import type { InsightType } from '@/lib/supabase/types'

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
