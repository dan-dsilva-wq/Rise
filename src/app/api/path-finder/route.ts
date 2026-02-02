import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

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
    const supabaseClient = await createClient()
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { messages } = await request.json() as { messages: ChatMessage[] }

    const systemPrompt = `You are an expert life coach and business advisor helping someone discover what they should build to achieve freedom. Your goal is to have a deep, thoughtful conversation to help them find the PERFECT path forward.

## Your Approach
1. **Listen deeply** - Understand their full situation before suggesting anything
2. **Ask probing questions** - One or two at a time, never overwhelm
3. **Explore trade-offs** - Help them think through pros/cons of different paths
4. **Be specific** - Don't suggest vague things like "build a SaaS". Get concrete.
5. **Challenge assumptions** - Push back gently if they seem stuck in limiting beliefs

## What You Need to Understand
Before making any suggestions, you MUST understand:
- Their background and skills (technical, creative, domain knowledge)
- Their current situation (time available, financial runway, constraints)
- What "freedom" means to them specifically
- What they've already tried or considered
- What energizes them vs drains them
- Their risk tolerance

## Conversation Flow
1. **Open warmly** - Acknowledge this is important, you're here to help
2. **Explore their situation** - Ask questions, really listen
3. **Dig deeper** - When they give surface answers, ask follow-ups
4. **Reflect back** - Summarize what you're hearing to confirm understanding
5. **Explore options together** - Present possibilities, discuss trade-offs
6. **Narrow down** - Help them identify the most promising path
7. **Get concrete** - When ready, suggest specific first steps

## Important Rules
- NEVER jump to suggestions too quickly. Spend time understanding first.
- Ask ONE or TWO questions at a time, not a list
- Use their specific words and situation in your responses
- If they seem uncertain about something, explore why
- Be encouraging but realistic - don't overpromise
- When you finally suggest something, make it SPECIFIC and ACTIONABLE

## When Ready to Suggest
Only after thorough exploration, when you have a clear picture, suggest something like:
"Based on everything we've discussed, here's what I think could work for you: [SPECIFIC IDEA]. Here's why this fits you: [REASONS]. The first milestone would be: [CONCRETE FIRST STEP]."

Remember: This conversation could change their life. Take it seriously. Don't rush.`

    const formattedMessages = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    const response = await getAnthropic().messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 1000,
      system: systemPrompt,
      messages: formattedMessages,
    })

    // Extract text from response
    const assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('\n')

    return Response.json({
      message: assistantMessage,
    })
  } catch (error) {
    console.error('Path Finder API error:', error)
    return new Response(
      error instanceof Error ? error.message : 'Internal server error',
      { status: 500 }
    )
  }
}
