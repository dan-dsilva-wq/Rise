import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchAiContextForApi, saveAiInsight } from '@/lib/hooks/aiContextServer'
import { cachedWeaveMemory, buildRisePersonalityCore, parseInsightTags, stripInsightTags, fetchDisplayName } from '@/lib/ai/memoryWeaver'
import { ANTHROPIC_SONNET_MODEL } from '@/lib/ai/model-config'

let anthropic: Anthropic | null = null
function getAnthropic() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropic
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const supabaseClient = await createClient()
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { messages }: { messages: ChatMessage[] } = await request.json()

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'Messages required' }, { status: 400 })
    }

    const [aiContext, wovenMemory, displayName] = await Promise.all([
      fetchAiContextForApi(supabaseClient, user.id),
      cachedWeaveMemory(supabaseClient, user.id, {
        currentSource: 'brain_dump',
        maxPerSource: 8,
        lookbackDays: 7,
      }),
      fetchDisplayName(supabaseClient, user.id),
    ])

    const personalityCore = buildRisePersonalityCore({
      displayName,
      userThreadBlock: null,
      memoryBlock: wovenMemory.contextBlock || null,
    })

    const contextSection = aiContext.fullContext
      ? `\n\n## What You Already Know About Them\n${aiContext.fullContext}`
      : ''

    const memorySection = wovenMemory.contextBlock
      ? `\n\n${wovenMemory.contextBlock}`
      : ''

    const systemPrompt = `${personalityCore}

You are Rise in BRAIN DUMP mode.
This is spoken conversation. Keep it ultra-light and fast.

## Hard Output Rules
- Usually reply with exactly TWO short lines:
  1) one brief reflection (max ~12 words)
  2) one single follow-up question
- Keep total reply under ~26 words.
- Never ask multiple questions in one turn.
- No markdown, bullets, emojis, or long explanations.

## If the user is done
If the user clearly signals they are done (e.g. "that's it", "I'm done", "all good", "that's everything"):
- reply with exactly two short sentences:
  1) concise wrap-up of what you heard
  2) one practical takeaway
- do NOT ask a question.

## Tone
- Warm, clear, grounded.
- Curious, not clinical.
- Keep momentum moving.

## Learning New Things
When you discover something important, save it:

[INSIGHT]
type: <discovery|decision|blocker|preference|learning>
content: <what was learned>
importance: <1-10>
[/INSIGHT]
${contextSection}${memorySection}`

    const response = await getAnthropic().messages.create({
      model: ANTHROPIC_SONNET_MODEL,
      max_tokens: 180,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })

    let assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('\n')

    // Parse and save insights
    const extractedInsights = parseInsightTags(assistantMessage)
    if (extractedInsights.length > 0) {
      Promise.all(
        extractedInsights.map(insight =>
          saveAiInsight(supabaseClient, user.id, insight.type, insight.content, 'brain_dump', {
            importance: insight.importance,
          })
        )
      ).catch(err => console.error('Error saving brain dump insights:', err))
    }

    assistantMessage = stripInsightTags(assistantMessage)

    return Response.json({ message: assistantMessage })
  } catch (error) {
    console.error('Brain dump chat API error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 }
    )
  }
}
