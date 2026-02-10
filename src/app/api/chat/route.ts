import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchAiContextForApi, saveAiInsight } from '@/lib/hooks/aiContextServer'
import { cachedWeaveMemory, cachedSynthesizeUserThread, resolveActiveMilestoneStep, parseInsightTags, stripInsightTags, fetchDisplayName, buildRisePersonalityCore } from '@/lib/ai/memoryWeaver'
import { prepareConversationHistory } from '@/lib/ai/conversationHistory'

// Lazy initialize to avoid build-time errors
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

interface ChatRequest {
  messages: ChatMessage[]
  projectId: string
  approach?: 'do-it' | 'guide'
  projectContext?: {
    name: string
    description: string | null
    status: string
    milestones: Array<{ title: string; status: string; description: string | null }>
  }
}

// Generate dynamic expert persona based on project context
function generateExpertise(
  projectName: string,
  projectDescription: string | null,
  projectStatus: string,
  milestones: Array<{ title: string; status: string; description: string | null }>,
  contextBank: string
): string {
  const activeMilestones = milestones.filter(m => m.status !== 'completed' && m.status !== 'discarded')
  const milestoneSummary = activeMilestones.map(m => m.title).join(', ')

  return `Based on this context, YOU determine what kind of expert you should be:

Project: ${projectName}
Description: ${projectDescription || 'Not specified'}
Status: ${projectStatus}
Active milestones: ${milestoneSummary || 'None'}
Known context: ${contextBank || 'None yet'}

INSTRUCTIONS FOR DETERMINING YOUR EXPERT IDENTITY:
1. Analyze the project name, description, and milestones to understand the DOMAIN
2. Become the expert this project needs — the person you'd hire as a cofounder
3. Your expertise should shift as the conversation shifts (marketing question → marketing expert, code question → engineer)

Be the precise expert they need RIGHT NOW. Not a generalist — their specialist cofounder.`
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set')
      return Response.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const supabaseClient = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = supabaseClient as any
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body: ChatRequest = await request.json()
    const { messages, projectId, projectContext, approach } = body

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'Messages required' }, { status: 400 })
    }

    // Fetch AI context bank, unified memory, user thread, active milestone step, AND display name in parallel.
    // Memory and user thread use TTL-cached versions — during active chat sessions these
    // heavy multi-query functions get called per message, but the context doesn't change
    // that quickly. Caching cuts ~10 DB queries per message after the first one.
    const [aiContext, wovenMemory, userThread, activeMilestoneData, displayName] = await Promise.all([
      fetchAiContextForApi(
        supabaseClient,
        user.id,
        projectId || undefined
      ),
      cachedWeaveMemory(supabaseClient, user.id, {
        currentSource: 'project_chat',
        projectId: projectId || undefined,
        maxPerSource: 12,
        lookbackDays: 7,
      }),
      cachedSynthesizeUserThread(supabaseClient, user.id, {
        includeWorkPatterns: true,
        lookbackDays: 14,
      }),
      // Fetch the active milestone + current step so AI knows exactly where the user is
      projectId ? resolveActiveMilestoneStep(supabaseClient, projectId, user.id) : Promise.resolve(null),
      // Fetch display name so AI can address user by name — the "cofounder knows you" effect
      fetchDisplayName(supabaseClient, user.id),
    ])

    // Build context bank section if we have data
    const contextBankSection = aiContext.fullContext
      ? `\n\n## Context Bank (What We Already Know)\n${aiContext.fullContext}\n\nUSE THIS CONTEXT! Don't ask questions you already know the answer to.`
      : ''

    // Add unified memory for cross-conversation awareness
    const memorySection = wovenMemory.contextBlock
      ? `\n\n${wovenMemory.contextBlock}`
      : ''

    // Add User Thread (who they are as a person) — shapes tone and approach
    const userThreadSection = userThread.threadBlock
      ? `\n\n${userThread.threadBlock}`
      : ''

    // Build project overview section
    let projectOverview = ''
    if (projectContext) {
      const completedCount = projectContext.milestones.filter(m => m.status === 'completed').length
      const totalCount = projectContext.milestones.length

      // Build active milestone + step context (the "I know exactly where you are" section)
      let activeStepSection = ''
      if (activeMilestoneData) {
        activeStepSection = `\n\n## Where They Are Right Now
Active milestone: **${activeMilestoneData.milestoneTitle}**`
        if (activeMilestoneData.totalSteps > 0) {
          activeStepSection += `\nStep progress: ${activeMilestoneData.completedSteps}/${activeMilestoneData.totalSteps} steps complete`
          if (activeMilestoneData.currentStepText) {
            activeStepSection += `\nCurrent step: **"${activeMilestoneData.currentStepText}"** (step ${activeMilestoneData.stepNumber} of ${activeMilestoneData.totalSteps})`
          } else {
            activeStepSection += `\nAll steps complete — milestone may be ready to mark done`
          }
        }
        activeStepSection += `\n\nIMPORTANT: You already know their current focus. If they ask "what should I do?" or "where was I?", reference this step directly. Don't make them re-explain where they are.`
      }

      projectOverview = `
## Current Project
**${projectContext.name}** - ${projectContext.description || 'No description'}
Status: ${projectContext.status}
Progress: ${completedCount}/${totalCount} milestones complete

## Milestones
${projectContext.milestones.map((m, i) => `${i + 1}. [${m.status}] ${m.title}${m.description ? ` - ${m.description}` : ''}`).join('\n')}${activeStepSection}
${contextBankSection}${memorySection}${userThreadSection}`
    }

    // Generate dynamic expertise
    const expertiseInstructions = projectContext
      ? generateExpertise(
          projectContext.name,
          projectContext.description,
          projectContext.status,
          projectContext.milestones,
          aiContext.fullContext || ''
        )
      : ''

    // Build shared personality core (same voice across all Rise surfaces)
    const personalityCore = buildRisePersonalityCore({
      displayName,
      userThreadBlock: userThread.threadBlock || null,
      memoryBlock: wovenMemory.contextBlock || null,
    })

    // Build system prompt based on approach
    const isDoIt = approach === 'do-it'

    const systemPrompt = isDoIt
      ? `${personalityCore}

You are a SPECIALIST who DOES THE WORK. You're not a generalist - you're the exact expert cofounder they need for this specific project.

${expertiseInstructions ? `## Determine Your Expert Identity\n${expertiseInstructions}\n` : ''}
${projectOverview}

## Your Role - DO IT FOR THEM
The user chose "Do it for me" mode. They want you to:
- **Write code** - Give them complete, working code they can copy-paste
- **Write content** - Draft full copy, emails, documentation, etc.
- **Create plans** - Detailed step-by-step plans with specifics
- **Solve problems** - Give direct solutions, not questions

## Your Approach
1. **Ask clarifying questions ONCE** - Get what you need to do the work
2. **Then DO the work** - Provide complete, ready-to-use output
3. **Be thorough** - Don't make them ask follow-up questions
4. **Format for easy use** - Code in code blocks, content ready to copy

## Important
- You ARE here to do the work, not just coach
- Provide COMPLETE solutions they can use immediately
- Ask minimal questions, maximize output
- If you can do it, do it. Don't ask "would you like me to..."
- USE THE CONTEXT BANK above - don't ask about things we already know

## Learning New Things
When you discover something new about the user or project, save it:

[INSIGHT]
type: <discovery|decision|blocker|preference|learning>
content: <what was learned>
importance: <1-10>
[/INSIGHT]

Remember: They chose "Do it for me" because they want results, not guidance.`
      : `${personalityCore}

You're in Guide & Collaborate mode — helping them think through problems and build alongside them.

${expertiseInstructions ? `## Determine Your Expert Identity\n${expertiseInstructions}\n` : ''}
${projectOverview}

## Your Role - GUIDE & COLLABORATE
Help them think through problems and build alongside them:
- Be concise but thorough
- Give actionable advice
- Break down complex tasks into smaller steps
- Encourage progress over perfection
- When they're stuck, help them find the next smallest step
- USE THE CONTEXT BANK - leverage what we know about the user and project

You can help with:
- Brainstorming and ideation
- Technical implementation guidance
- Writing code (provide complete, working examples when asked)
- Debugging issues
- Marketing and launch strategy
- Staying motivated and focused

## Conversation Style
- Be a thinking partner, not just an answer machine
- Ask good questions that uncover the real problem
- Offer your perspective as a cofounder would
- Celebrate progress and acknowledge challenges honestly

## Learning New Things
When you discover something new about the user or project, save it:

[INSIGHT]
type: <discovery|decision|blocker|preference|learning>
content: <what was learned>
importance: <1-10>
[/INSIGHT]`

    const preparedHistory = await prepareConversationHistory({
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      anthropic: getAnthropic(),
      userId: user.id,
      conversationKey: projectId ? `project-chat:${projectId}` : 'project-chat:general',
      supabase: supabaseClient,
    })

    // Call Anthropic Claude — same model as Milestone Mode for ONE consistent mind
    const response = await getAnthropic().messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 4096,
      system: systemPrompt,
      messages: preparedHistory.messages,
    })

    let assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('\n')

    // Parse and save any insights from the response
    const extractedInsights = parseInsightTags(assistantMessage)
    if (extractedInsights.length > 0) {
      Promise.all(
        extractedInsights.map(insight =>
          saveAiInsight(
            supabaseClient,
            user.id,
            insight.type,
            insight.content,
            'project_chat',
            {
              projectId: projectId || undefined,
              importance: insight.importance,
            }
          )
        )
      ).catch(err => console.error('Error saving project chat insights:', err))
    }

    // Remove insight tags from visible message
    assistantMessage = stripInsightTags(assistantMessage)

    // Save to project_logs
    if (projectId) {
      const lastUserMessage = messages[messages.length - 1]

      // Save both messages in parallel
      await Promise.all([
        supabase.from('project_logs').insert({
          project_id: projectId,
          user_id: user.id,
          role: 'user',
          content: lastUserMessage.content,
        }),
        supabase.from('project_logs').insert({
          project_id: projectId,
          user_id: user.id,
          role: 'assistant',
          content: assistantMessage,
        }),
      ])
    }

    return Response.json({
      message: assistantMessage,
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
