import type { SupabaseClient } from '@supabase/supabase-js'

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
    const [pathFinderMsg, milestoneMsg, projectLogMsg, weeklyCompletions, recentLogDates] = await Promise.all([
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
      // Recent daily log dates (for days since last visit)
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

    // Calculate days since last visit from daily log dates
    const logDates = ((recentLogDates.data || []) as Array<{ log_date: string }>).map(l => l.log_date)
    if (logDates.length > 0) {
      const today = new Date().toISOString().split('T')[0]
      const mostRecentLog = logDates[0]

      // Days since last visit: diff between today and most recent log
      const todayDate = new Date(today + 'T00:00:00Z')
      const lastDate = new Date(mostRecentLog + 'T00:00:00Z')
      const daysDiff = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      signals.daysSinceLastVisit = daysDiff
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

  // ─── TIER 7: DEFAULT WARMTH ───
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
