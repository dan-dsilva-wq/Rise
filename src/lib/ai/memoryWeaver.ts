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
 * Fetches recent conversations from all sources and weaves them into
 * a unified memory context that makes Rise feel like one mind.
 */
export async function weaveMemory(
  client: SupabaseClient,
  userId: string,
  options: {
    /** Which source is asking (so we deprioritize its own messages) */
    currentSource?: 'path_finder' | 'milestone_mode' | 'project_chat' | 'morning_briefing'
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
