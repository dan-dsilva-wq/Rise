import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { weaveMemory } from '@/lib/ai/memoryWeaver'

let anthropic: Anthropic | null = null
function getAnthropic() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropic
}

/**
 * Rise Insights API — "Rise noticed something about you"
 *
 * This is the proactive AI brain. It analyzes the user's recent activity,
 * emotional patterns, conversation threads, and project progress to generate
 * observations that make users feel truly seen.
 *
 * These aren't generic motivational quotes — they're specific, personal,
 * and sometimes surprising connections that only an AI with full context
 * could make.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const supabaseClient = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabaseClient as any
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    // Gather all the raw signals about this user in parallel
    const [wovenMemory, recentLogs, recentMilestones, profileFacts, recentInsights] = await Promise.all([
      // Full memory weave — conversations, emotions, themes
      weaveMemory(supabaseClient, user.id, {
        currentSource: 'morning_briefing',
        maxPerSource: 20,
        lookbackDays: 14,
      }),

      // Daily logs for mood/energy patterns
      client
        .from('daily_logs')
        .select('log_date, morning_mood, morning_energy, evening_mood, evening_energy, day_rating, gratitude_entry, reflection_notes, im_up_pressed_at')
        .eq('user_id', user.id)
        .order('log_date', { ascending: false })
        .limit(14),

      // Recent milestone activity (completions, step progress)
      client
        .from('milestones')
        .select('id, title, status, completed_at, updated_at, project_id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(20),

      // Profile facts for personalization
      client
        .from('user_profile_facts')
        .select('category, fact')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(30),

      // Recent AI insights that have been discovered
      client
        .from('ai_insights')
        .select('insight_type, content, importance, source_ai, created_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .gte('importance', 5)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const dailyLogs = (recentLogs.data || []) as Array<{
      log_date: string
      morning_mood: number | null
      morning_energy: number | null
      evening_mood: number | null
      evening_energy: number | null
      day_rating: number | null
      gratitude_entry: string | null
      reflection_notes: string | null
      im_up_pressed_at: string | null
    }>

    const milestones = (recentMilestones.data || []) as Array<{
      id: string; title: string; status: string; completed_at: string | null; updated_at: string; project_id: string
    }>

    const facts = (profileFacts.data || []) as Array<{ category: string; fact: string }>
    const insights = (recentInsights.data || []) as Array<{
      insight_type: string; content: string; importance: number; source_ai: string; created_at: string
    }>

    // Check if there's enough data to generate meaningful insights
    const hasActivity = dailyLogs.length > 0 || wovenMemory.sourceCount > 0 || milestones.length > 0
    if (!hasActivity) {
      return Response.json({
        insights: [],
        hasEnoughData: false,
      })
    }

    // Build the raw signal context for the AI
    const signalSections: string[] = []

    // Mood/energy patterns
    if (dailyLogs.length >= 2) {
      const moodData = dailyLogs
        .filter(l => l.morning_mood || l.evening_mood)
        .map(l => `${l.log_date}: morning=${l.morning_mood ?? '?'} evening=${l.evening_mood ?? '?'} energy_am=${l.morning_energy ?? '?'} energy_pm=${l.evening_energy ?? '?'} rating=${l.day_rating ?? '?'}`)
        .join('\n')
      if (moodData) {
        signalSections.push(`## Mood & Energy Data (last ${dailyLogs.length} days)\n${moodData}`)
      }

      // Wake time patterns
      const wakeTimes = dailyLogs.filter(l => l.im_up_pressed_at).map(l => ({
        date: l.log_date,
        time: l.im_up_pressed_at ? new Date(l.im_up_pressed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null,
      }))
      if (wakeTimes.length >= 2) {
        signalSections.push(`## Wake Times\n${wakeTimes.map(w => `${w.date}: ${w.time}`).join('\n')}`)
      }

      // Gratitude entries
      const gratitudes = dailyLogs.filter(l => l.gratitude_entry).map(l => `${l.log_date}: "${l.gratitude_entry}"`)
      if (gratitudes.length > 0) {
        signalSections.push(`## Recent Gratitude Entries\n${gratitudes.join('\n')}`)
      }
    }

    // Milestone progress
    const recentCompletions = milestones.filter(m => m.status === 'completed' && m.completed_at)
    const activeMilestones = milestones.filter(m => m.status !== 'completed' && m.status !== 'discarded' && m.status !== 'idea')
    if (recentCompletions.length > 0 || activeMilestones.length > 0) {
      const parts: string[] = []
      if (recentCompletions.length > 0) {
        parts.push(`Recently completed: ${recentCompletions.map(m => `"${m.title}"`).join(', ')}`)
      }
      if (activeMilestones.length > 0) {
        parts.push(`Active milestones: ${activeMilestones.slice(0, 5).map(m => `"${m.title}" (${m.status})`).join(', ')}`)
      }
      signalSections.push(`## Project Progress\n${parts.join('\n')}`)
    }

    // Profile facts
    if (facts.length > 0) {
      const factsByCategory: Record<string, string[]> = {}
      for (const f of facts) {
        if (!factsByCategory[f.category]) factsByCategory[f.category] = []
        factsByCategory[f.category].push(f.fact)
      }
      const factLines = Object.entries(factsByCategory)
        .map(([cat, items]) => `${cat}: ${items.join('; ')}`)
        .join('\n')
      signalSections.push(`## What We Know About Them\n${factLines}`)
    }

    // Recent AI discoveries
    if (insights.length > 0) {
      signalSections.push(`## Recent AI Discoveries\n${insights.map(i => `[${i.insight_type}] ${i.content} (importance: ${i.importance})`).join('\n')}`)
    }

    // Cross-conversation memory
    if (wovenMemory.contextBlock) {
      signalSections.push(wovenMemory.contextBlock)
    }

    // If no API key, return pattern-based insights without AI
    if (!process.env.ANTHROPIC_API_KEY) {
      const fallbackInsights = generateFallbackInsights(dailyLogs, milestones, wovenMemory)
      return Response.json({
        insights: fallbackInsights,
        hasEnoughData: true,
        generated: false,
      })
    }

    // Generate insights with AI
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: `You are Rise's pattern-recognition engine. Your job is to analyze raw user data and generate 1-2 PROACTIVE observations that would make the user feel deeply understood.

These are NOT motivational quotes. They are specific, data-backed observations that connect dots the user hasn't connected themselves.

RULES:
- Each insight must reference SPECIFIC data points (dates, mood numbers, specific things they said)
- Connect things across different data sources (mood + project progress, gratitude + milestones, conversations + energy)
- Be conversational and warm, like a brilliant friend who's been paying attention
- Never be preachy or prescriptive — observe, don't lecture
- Insights should spark curiosity or self-awareness, not guilt
- Keep each insight to 1-2 sentences max
- If energy/mood data shows a dip, be gentle and curious, not alarming
- If you spot a positive pattern, highlight it without being cheesy

GREAT examples:
- "Your energy ratings have been 2 points higher on days when you work on [project]. That's your body telling you something."
- "You keep mentioning [topic] across different conversations but haven't made it a milestone yet. Maybe it's more important than you think?"
- "Three of your last four gratitude entries mention people, not achievements. That tells me a lot about what actually matters to you."
- "You completed 2 milestones this week after struggling for 10 days. Something shifted — what was different?"

BAD examples (don't do these):
- "Keep up the great work!" (generic)
- "You should try waking up earlier" (prescriptive)
- "Remember, progress is progress" (motivational poster)
- "Your mood was low yesterday" (observation without insight)

Respond in JSON format:
{
  "insights": [
    {
      "text": "the observation itself",
      "type": "pattern" | "connection" | "shift" | "question",
      "warmth": "encouraging" | "curious" | "gentle" | "celebratory"
    }
  ]
}

Return 1-2 insights only. Quality over quantity. If the data doesn't support a genuinely interesting insight, return an empty array rather than forcing something mediocre.`,
      messages: [{
        role: 'user',
        content: `Here's everything I know about this user. Find the most interesting patterns:\n\n${signalSections.join('\n\n')}`,
      }],
    })

    // Parse AI response
    const aiText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('')

    let parsedInsights: Array<{ text: string; type: string; warmth: string }> = []
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        parsedInsights = parsed.insights || []
      }
    } catch {
      // Fallback to pattern-based insights if AI response can't be parsed
      const fallbackInsights = generateFallbackInsights(dailyLogs, milestones, wovenMemory)
      return Response.json({
        insights: fallbackInsights,
        hasEnoughData: true,
        generated: false,
      })
    }

    return Response.json({
      insights: parsedInsights,
      hasEnoughData: true,
      generated: true,
    })

  } catch (error) {
    console.error('Rise Insights error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to generate insights' },
      { status: 500 }
    )
  }
}

/**
 * Fallback insight generation when there's no AI API key.
 * Uses simple pattern matching on the raw data.
 */
function generateFallbackInsights(
  dailyLogs: Array<{
    log_date: string
    morning_mood: number | null
    morning_energy: number | null
    evening_mood: number | null
    evening_energy: number | null
    day_rating: number | null
    gratitude_entry: string | null
  }>,
  milestones: Array<{ title: string; status: string; completed_at: string | null }>,
  wovenMemory: { sourceCount: number; hasCrossThreadInsights: boolean; briefSummary: string }
): Array<{ text: string; type: string; warmth: string }> {
  const insights: Array<{ text: string; type: string; warmth: string }> = []

  // Check for mood improvement trend
  const moodLogs = dailyLogs.filter(l => l.evening_mood != null)
  if (moodLogs.length >= 3) {
    const recent = moodLogs.slice(0, 2)
    const older = moodLogs.slice(-2)
    const recentAvg = recent.reduce((s, l) => s + (l.evening_mood || 5), 0) / recent.length
    const olderAvg = older.reduce((s, l) => s + (l.evening_mood || 5), 0) / older.length
    if (recentAvg > olderAvg + 1.5) {
      insights.push({
        text: `Your evening mood has been climbing — from ${olderAvg.toFixed(1)} to ${recentAvg.toFixed(1)} over the past few days. Something's working.`,
        type: 'shift',
        warmth: 'celebratory',
      })
    } else if (recentAvg < olderAvg - 1.5) {
      insights.push({
        text: `Your mood dipped a bit recently. No judgment — just noticing. What feels heavy right now?`,
        type: 'shift',
        warmth: 'gentle',
      })
    }
  }

  // Check for milestone completions
  const recentCompletions = milestones.filter(m => m.status === 'completed' && m.completed_at)
  if (recentCompletions.length >= 2) {
    insights.push({
      text: `You completed ${recentCompletions.length} milestones recently, including "${recentCompletions[0].title}". That's real momentum building.`,
      type: 'pattern',
      warmth: 'celebratory',
    })
  }

  // Cross-conversation insight
  if (wovenMemory.hasCrossThreadInsights && wovenMemory.sourceCount >= 2) {
    insights.push({
      text: `I've been connecting dots across our conversations. The themes you keep coming back to might be pointing somewhere interesting.`,
      type: 'connection',
      warmth: 'curious',
    })
  }

  return insights.slice(0, 2)
}
