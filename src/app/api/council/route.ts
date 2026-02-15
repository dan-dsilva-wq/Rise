import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchAiContextForApi, saveAiInsight } from '@/lib/hooks/aiContextServer'
import {
  buildRisePersonalityCore,
  cachedSynthesizeUserThread,
  cachedWeaveMemory,
  fetchDisplayName,
  parseInsightTags,
  stripInsightTags,
} from '@/lib/ai/memoryWeaver'
import { prepareConversationHistory } from '@/lib/ai/conversationHistory'
import {
  extractTextFromClaude,
  getCouncilStructuredOutputInstructions,
  parseCouncilPayload,
} from '@/lib/ai/council'
import { ANTHROPIC_OPUS_MODEL } from '@/lib/ai/model-config'
import { getAppCapabilitiesPromptBlock } from '@/lib/path-finder/app-capabilities'

interface CouncilMessage {
  role: 'user' | 'assistant'
  content: string
}

interface CouncilRequest {
  messages: CouncilMessage[]
}

let anthropic: Anthropic | null = null
function getAnthropic() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropic
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

    const body: CouncilRequest = await request.json()
    const messages = body.messages || []
    if (messages.length === 0) {
      return Response.json({ error: 'Messages required' }, { status: 400 })
    }

    const [aiContext, wovenMemory, userThread, displayName, appCapabilitiesBlock] = await Promise.all([
      fetchAiContextForApi(supabaseClient, user.id),
      cachedWeaveMemory(supabaseClient, user.id, {
        currentSource: 'path_finder',
        maxPerSource: 12,
        lookbackDays: 7,
      }),
      cachedSynthesizeUserThread(supabaseClient, user.id, {
        includeWorkPatterns: true,
        lookbackDays: 14,
      }),
      fetchDisplayName(supabaseClient, user.id),
      getAppCapabilitiesPromptBlock('council'),
    ])

    const personalityCore = buildRisePersonalityCore({
      displayName,
      userThreadBlock: userThread.threadBlock || null,
      memoryBlock: wovenMemory.contextBlock || null,
    })

    const contextBankSection = aiContext.fullContext
      ? `\n\n## Context Bank\n${aiContext.fullContext}`
      : ''

    const systemPrompt = `${personalityCore}

${appCapabilitiesBlock}

You are Rise Council - a multi-perspective decision room for general life/work decisions.

Roles to run internally before answering:
- Analyst: clarify facts, assumptions, constraints
- Critic: identify blind spots and downside risks
- Strategist: compare options and tradeoffs
- Operator: define practical next actions

After role analysis, synthesize one answer the user can act on.
Keep guidance concrete, concise, and reality-based.
${contextBankSection}

Decision quality rules:
- If key context is missing (options, constraints, timeline, stakes), ask up to 3 clarifying questions first.
- If enough context is present, provide a direct recommendation with clear tradeoffs.
- Default to reversible next steps when uncertainty is high.
- Avoid vague motivation language; prioritize practical decision leverage.

In "final_answer", use this structure:
1) Recommendation
2) Why this is the best move
3) Tradeoffs and risks
4) Next 3 actions (small and concrete)

${getCouncilStructuredOutputInstructions()}`

    const preparedHistory = await prepareConversationHistory({
      messages: messages.map(message => ({
        role: message.role,
        content: message.content,
      })),
      anthropic: getAnthropic(),
      userId: user.id,
      conversationKey: 'council:general',
      supabase: supabaseClient,
    })

    const councilResponse = await getAnthropic().messages.create({
      model: ANTHROPIC_OPUS_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: preparedHistory.messages,
    })

    const councilText = extractTextFromClaude(councilResponse)
    const parsedCouncil = parseCouncilPayload(councilText)

    let visibleMessage = parsedCouncil?.final_answer?.trim() || ''
    let councilDetails = parsedCouncil
      ? {
        analyst: parsedCouncil.analyst,
        critic: parsedCouncil.critic,
        strategist: parsedCouncil.strategist,
        operator: parsedCouncil.operator,
        synthesis: parsedCouncil.synthesis,
      }
      : null

    if (!visibleMessage) {
      const fallbackResponse = await getAnthropic().messages.create({
        model: ANTHROPIC_OPUS_MODEL,
        max_tokens: 1200,
        system: `${personalityCore}\n\n${appCapabilitiesBlock}\n\nYou are a practical decision coach. Give one clear recommendation with tradeoffs and next steps.`,
        messages: preparedHistory.messages,
      })
      visibleMessage = extractTextFromClaude(fallbackResponse)
      councilDetails = null
    }

    const payloadInsights = parsedCouncil?.insights || []
    const tagFallbackInsights = parseInsightTags(visibleMessage)
    const insightsToPersist = [...payloadInsights, ...tagFallbackInsights]
    if (insightsToPersist.length > 0) {
      Promise.all(
        insightsToPersist.map(insight =>
          saveAiInsight(
            supabaseClient,
            user.id,
            insight.type,
            insight.content,
            'intelligence_layer',
            { importance: insight.importance }
          )
        )
      ).catch(err => console.error('Error saving council insights:', err))
    }

    visibleMessage = stripInsightTags(visibleMessage)

    return Response.json({
      message: visibleMessage,
      council: councilDetails,
    })
  } catch (error) {
    console.error('Council API error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
