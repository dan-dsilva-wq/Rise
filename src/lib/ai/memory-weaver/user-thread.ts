import type { SupabaseClient } from '@supabase/supabase-js'

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
