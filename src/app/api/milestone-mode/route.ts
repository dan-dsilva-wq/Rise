import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchAiContextForApi } from '@/lib/hooks/aiContextServer'
import {
  cachedWeaveMemory,
  cachedSynthesizeUserThread,
  parseInsightTags,
  stripInsightTags,
  fetchDisplayName,
  buildRisePersonalityCore,
} from '@/lib/ai/memoryWeaver'
import { prepareConversationHistory } from '@/lib/ai/conversationHistory'
import { ANTHROPIC_OPUS_MODEL } from '@/lib/ai/model-config'
import { parseMilestoneActions, stripMilestoneActionTags } from './parsing'
import { buildMilestoneModePrompt } from './prompt'
import { persistMilestoneModeInsights } from './service'
import type { ChatMessage, MilestoneContext, ProjectContextInput } from './types'
import { getAppCapabilitiesPromptBlock } from '@/lib/path-finder/app-capabilities'

let anthropic: Anthropic | null = null
function getAnthropic() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropic
}

const AUTO_DO_IT_KICKOFF_MARKER = '[AUTO_DO_IT_KICKOFF]'

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

    const { messages, milestone, project, approach } = await request.json() as {
      messages: ChatMessage[]
      milestone: MilestoneContext
      project: ProjectContextInput
      approach?: 'do-it' | 'guide'
    }

    const sanitizedMessages = messages.filter(
      msg => !(msg.role === 'user' && msg.content.trim() === AUTO_DO_IT_KICKOFF_MARKER)
    )
    const userMessageCount = sanitizedMessages.filter(msg => msg.role === 'user').length
    const isDoItKickoff = approach === 'do-it' && userMessageCount === 0

    const [aiContext, wovenMemory, userThread, displayName, appCapabilitiesBlock] = await Promise.all([
      fetchAiContextForApi(
        supabaseClient,
        user.id,
        project.id,
        milestone.id
      ),
      cachedWeaveMemory(supabaseClient, user.id, {
        currentSource: 'milestone_mode',
        projectId: project.id,
        maxPerSource: 12,
        lookbackDays: 7,
      }),
      cachedSynthesizeUserThread(supabaseClient, user.id, {
        includeWorkPatterns: true,
        lookbackDays: 14,
      }),
      fetchDisplayName(supabaseClient, user.id),
      getAppCapabilitiesPromptBlock('milestone_mode'),
    ])

    const personalityCore = buildRisePersonalityCore({
      displayName,
      userThreadBlock: userThread.threadBlock || null,
      memoryBlock: wovenMemory.contextBlock || null,
    })

    const systemPrompt = buildMilestoneModePrompt({
      approach: approach ?? 'guide',
      isDoItKickoff,
      personalityCore,
      appCapabilitiesBlock,
      milestone,
      project,
      contextBank: aiContext.fullContext || '',
      memoryBlock: wovenMemory.contextBlock || null,
      userThreadBlock: userThread.threadBlock || null,
    })

    const baseMessages = sanitizedMessages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }))

    if (baseMessages.length === 0) {
      baseMessages.push({
        role: 'user',
        content: 'Kick off this do-it-for-me session by asking your required execution questions.',
      })
    }

    const preparedHistory = await prepareConversationHistory({
      messages: baseMessages,
      anthropic: getAnthropic(),
      userId: user.id,
      conversationKey: `milestone-mode:${milestone.id}:${approach ?? 'guide'}`,
      supabase: supabaseClient,
    })

    const response = await getAnthropic().messages.create({
      model: ANTHROPIC_OPUS_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: preparedHistory.messages,
    })

    let assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('\n')

    const actions = parseMilestoneActions(assistantMessage, milestone.id)

    const extractedInsights = parseInsightTags(assistantMessage)
    persistMilestoneModeInsights({
      supabaseClient,
      userId: user.id,
      projectId: project.id,
      milestoneId: milestone.id,
      insights: extractedInsights,
    }).catch(err => console.error('Error saving milestone mode insights:', err))

    assistantMessage = stripInsightTags(assistantMessage)
    assistantMessage = stripMilestoneActionTags(assistantMessage)

    if (!assistantMessage) {
      assistantMessage = actions.length > 0
        ? 'Done. I updated your milestone progress.'
        : 'Done.'
    }

    return Response.json({
      message: assistantMessage,
      actions: actions.length > 0 ? actions : undefined,
    })
  } catch (error) {
    console.error('Milestone mode API error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
