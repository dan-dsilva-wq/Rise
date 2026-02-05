import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { cachedWeaveMemory, cachedSynthesizeUserThread, fetchDisplayName, buildRisePersonalityCore, parseInsightTags, stripInsightTags } from '@/lib/ai/memoryWeaver'
import { saveAiInsight } from '@/lib/hooks/aiContextServer'

let anthropic: Anthropic | null = null
function getAnthropic() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropic
}

interface ReflectionMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ReflectionRequest {
  messages: ReflectionMessage[]
  todayContext: {
    morningMood: number | null
    morningEnergy: number | null
    hasEveningData: boolean
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const supabaseClient = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = supabaseClient as any
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body: ReflectionRequest = await request.json()
    const { messages, todayContext } = body

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'Messages required' }, { status: 400 })
    }

    // Fetch memory, user thread, and display name in parallel
    const [wovenMemory, userThread, displayName] = await Promise.all([
      cachedWeaveMemory(supabaseClient, user.id, {
        currentSource: 'evening_reflection',
        maxPerSource: 10,
        lookbackDays: 3,
      }),
      cachedSynthesizeUserThread(supabaseClient, user.id, {
        includeWorkPatterns: true,
        lookbackDays: 14,
      }),
      fetchDisplayName(supabaseClient, user.id),
    ])

    const personalityCore = buildRisePersonalityCore({
      displayName,
      userThreadBlock: userThread.threadBlock || null,
      memoryBlock: wovenMemory.contextBlock || null,
    })

    const morningContext = todayContext.morningMood != null
      ? `\nThis morning they logged: mood ${todayContext.morningMood}/10, energy ${todayContext.morningEnergy}/10.`
      : ''

    const systemPrompt = `${personalityCore}

You are guiding an evening reflection conversation. This is a gentle, end-of-day check-in.
${morningContext}
${todayContext.hasEveningData ? '\nThey have already provided their evening scores — the reflection is wrapping up.' : ''}

## Your Role
- Be warm, real, and concise
- Ask ONE question at a time
- Listen to what they say and respond authentically
- After 2-4 exchanges, naturally ask them to rate their evening mood (1-10), energy (1-10), and overall day (1-10)
- If they share something they're grateful for, note it as their gratitude entry

## Conversation Flow
1. Opening: Acknowledge how the day went based on their morning data and what they share
2. Middle: One or two follow-up questions — keep it natural, not clinical
3. Close: Ask for their evening numbers (mood, energy, day rating) and optionally a gratitude note

## When you have their evening scores
When the user provides mood, energy, and day rating numbers, include this JSON block at the END of your message (after your text response):

[EVENING_DATA]
{"mood": <1-10>, "energy": <1-10>, "rating": <1-10>, "gratitude": "<optional gratitude text or null>"}
[/EVENING_DATA]

Also set [COMPLETE] at the very end if the reflection feels naturally finished.

## Learning New Things
When you discover something meaningful about the user, save it:

[INSIGHT]
type: <discovery|decision|blocker|preference|learning>
content: <what was learned>
importance: <1-10>
[/INSIGHT]

Keep the conversation short — 3-5 exchanges total. This is a wind-down, not a therapy session.`

    const formattedMessages = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    const response = await getAnthropic().messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 500,
      system: systemPrompt,
      messages: formattedMessages,
    })

    let assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('\n')

    // Parse insights
    const extractedInsights = parseInsightTags(assistantMessage)
    if (extractedInsights.length > 0) {
      Promise.all(
        extractedInsights.map(insight =>
          saveAiInsight(
            supabaseClient,
            user.id,
            insight.type,
            insight.content,
            'evening_reflection',
            { importance: insight.importance }
          )
        )
      ).catch(err => console.error('Error saving evening reflection insights:', err))
    }
    assistantMessage = stripInsightTags(assistantMessage)

    // Parse evening data if present
    let eveningData: { mood: number; energy: number; rating: number; gratitude: string | null } | null = null
    const eveningDataMatch = assistantMessage.match(/\[EVENING_DATA\]\s*([\s\S]*?)\s*\[\/EVENING_DATA\]/)
    if (eveningDataMatch) {
      try {
        eveningData = JSON.parse(eveningDataMatch[1])
      } catch {
        // ignore parse error
      }
      assistantMessage = assistantMessage.replace(/\[EVENING_DATA\][\s\S]*?\[\/EVENING_DATA\]/, '').trim()
    }

    // Check for completion marker
    const isComplete = assistantMessage.includes('[COMPLETE]')
    assistantMessage = assistantMessage.replace(/\[COMPLETE\]/g, '').trim()

    // If we got evening data, save it to daily_logs
    // Also save the conversation's key user messages as reflection_notes —
    // this is the MEMORY BRIDGE that lets tomorrow's morning briefing and
    // greeting reference what the user said tonight. Without this, the
    // evening reflection is a dead end: Rise forgets what you opened up about.
    const today = new Date().toISOString().split('T')[0]

    if (eveningData || isComplete) {
      const updateData: Record<string, unknown> = {}

      if (eveningData) {
        updateData.evening_mood = eveningData.mood
        updateData.evening_energy = eveningData.energy
        updateData.day_rating = eveningData.rating
        if (eveningData.gratitude) {
          updateData.gratitude_entry = eveningData.gratitude
        }
      }

      // Extract user messages (skip the synthetic opener trigger) and save as reflection notes.
      // This makes the evening conversation visible to weaveMemory's emotional arc builder,
      // the morning greeting generator, and any future surface that reads daily_logs.
      const userMessages = messages
        .filter(m => m.role === 'user' && m.content !== '[user opened evening reflection]')
        .map(m => m.content)
      if (userMessages.length > 0) {
        // Format: concise digest of what the user shared, max ~500 chars to stay lean
        const reflectionDigest = userMessages
          .map(msg => msg.length > 200 ? msg.slice(0, 197) + '...' : msg)
          .join(' | ')
          .slice(0, 500)
        updateData.reflection_notes = reflectionDigest
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('daily_logs')
          .update(updateData)
          .eq('user_id', user.id)
          .eq('log_date', today)
      }
    }

    return Response.json({
      message: assistantMessage,
      eveningData: eveningData ? { mood: eveningData.mood, energy: eveningData.energy, rating: eveningData.rating } : undefined,
      isComplete,
    })

  } catch (error) {
    console.error('Evening reflection error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to process reflection' },
      { status: 500 }
    )
  }
}
