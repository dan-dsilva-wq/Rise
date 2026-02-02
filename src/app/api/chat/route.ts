import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

// Lazy initialize to avoid build-time errors
let openai: OpenAI | null = null
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openai
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
  projectId: string
  projectContext?: {
    name: string
    description: string | null
    status: string
    milestones: Array<{ title: string; status: string; description: string | null }>
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabaseClient = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = supabaseClient as any
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body: ChatRequest = await request.json()
    const { messages, projectId, projectContext } = body

    if (!messages || messages.length === 0) {
      return new Response('Messages required', { status: 400 })
    }

    // Build system prompt with project context
    let systemPrompt = `You are an AI building partner helping a user build their project. You're supportive, practical, and focused on helping them make progress.

Key principles:
- Be concise but thorough
- Give actionable advice
- Break down complex tasks into smaller steps
- Encourage progress over perfection
- Celebrate wins, no matter how small
- When they're stuck, help them find the next smallest step

You can help with:
- Brainstorming and ideation
- Technical implementation
- Writing code (provide complete, working examples)
- Debugging issues
- Marketing and launch strategy
- Staying motivated`

    if (projectContext) {
      systemPrompt += `

## Current Project Context
**Name:** ${projectContext.name}
**Description:** ${projectContext.description || 'No description yet'}
**Status:** ${projectContext.status}

**Milestones:**
${projectContext.milestones.map((m, i) => `${i + 1}. [${m.status}] ${m.title}${m.description ? ` - ${m.description}` : ''}`).join('\n')}`
    }

    // Format messages for OpenAI API
    const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ]

    // Call OpenAI API
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: formattedMessages,
    })

    // Extract text from response
    const assistantMessage = response.choices[0]?.message?.content || ''

    // Save to project_logs
    if (projectId) {
      const lastUserMessage = messages[messages.length - 1]

      // Save user message
      await supabase.from('project_logs').insert({
        project_id: projectId,
        user_id: user.id,
        role: 'user',
        content: lastUserMessage.content,
      })

      // Save assistant message
      await supabase.from('project_logs').insert({
        project_id: projectId,
        user_id: user.id,
        role: 'assistant',
        content: assistantMessage,
      })
    }

    return Response.json({
      message: assistantMessage,
      usage: response.usage,
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(
      error instanceof Error ? error.message : 'Internal server error',
      { status: 500 }
    )
  }
}
