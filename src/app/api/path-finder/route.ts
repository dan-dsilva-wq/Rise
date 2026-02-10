import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { weaveMemory } from '@/lib/ai/memoryWeaver'
import { prepareConversationHistory } from '@/lib/ai/conversationHistory'
import { ANTHROPIC_OPUS_MODEL } from '@/lib/ai/model-config'
import { buildPathFinderSystemPrompt } from './prompt'
import {
  parseExtractedContexts,
  parseExtractedInsights,
  parseProjectActions,
  parseSuggestedFacts,
  stripPathFinderStructuredTags,
} from './parsing'
import { persistPathFinderContexts, persistPathFinderInsights } from './service'
import type { ChatMessage, ExistingProject } from './types'

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
      console.error('ANTHROPIC_API_KEY is not set')
      return Response.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const supabaseClient = await createClient()
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { messages, profileContext, existingProjects } = await request.json() as {
      messages: ChatMessage[]
      profileContext?: string
      existingProjects?: ExistingProject[]
    }

    const wovenMemory = await weaveMemory(supabaseClient, user.id, {
      currentSource: 'path_finder',
      maxPerSource: 15,
      lookbackDays: 7,
    })

    const systemPrompt = buildPathFinderSystemPrompt({
      profileContext,
      memoryContextBlock: wovenMemory.contextBlock,
      existingProjects,
    })

    const preparedHistory = await prepareConversationHistory({
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      anthropic: getAnthropic(),
      userId: user.id,
      conversationKey: 'path-finder:default',
      supabase: supabaseClient,
    })

    const response = await getAnthropic().messages.create({
      model: ANTHROPIC_OPUS_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: preparedHistory.messages,
    })

    let assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('\n')

    const suggestedFacts = parseSuggestedFacts(assistantMessage)
    const extractedContexts = parseExtractedContexts(assistantMessage)
    const extractedInsights = parseExtractedInsights(assistantMessage)
    const projectActions = parseProjectActions(assistantMessage)

    persistPathFinderContexts(supabaseClient, user.id, extractedContexts)
      .catch(err => console.error('Error saving project contexts:', err))
    persistPathFinderInsights(supabaseClient, user.id, extractedInsights)
      .catch(err => console.error('Error saving insights:', err))

    assistantMessage = stripPathFinderStructuredTags(assistantMessage)

    return Response.json({
      message: assistantMessage,
      suggestedFacts: suggestedFacts.length > 0 ? suggestedFacts : undefined,
      projectActions: projectActions.length > 0 ? projectActions : undefined,
    })
  } catch (error) {
    console.error('Path Finder API error:', error)
    return new Response(
      error instanceof Error ? error.message : 'Internal server error',
      { status: 500 }
    )
  }
}
