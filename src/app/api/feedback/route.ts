import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/notifications/webPush'
import { ANTHROPIC_SONNET_MODEL } from '@/lib/ai/model-config'
import type { Database } from '@/lib/supabase/types'

let anthropic: Anthropic | null = null
function getAnthropic() {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropic
}

function asTypedClient(client: Awaited<ReturnType<typeof createClient>>): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface FeedbackRequest {
  messages: ChatMessage[]
  action: 'chat' | 'summarize'
}

const CHAT_SYSTEM_PROMPT = `You are helping a beta tester give feedback about Rise, a personal growth and project tracking app. Dan built Rise and wants to know what users think.

Your job:
1. Listen to what the user wants (feature request, bug report, design feedback, any idea)
2. Ask clarifying questions to understand EXACTLY what they mean
3. Be warm, friendly, and casual - like a helpful friend
4. Keep questions simple and one at a time
5. After 2-3 exchanges where you understand clearly, say you'll pass it to Dan

Important:
- Keep responses SHORT - 1-2 sentences max
- If something is vague like "make it better", ask what specifically
- If they mention a specific page/feature, ask what about it they want changed
- When you understand, say something like "Got it! I'll pass this to Dan." or "Thanks! I'll let Dan know about that."`

const SUMMARY_SYSTEM_PROMPT = `Based on this conversation, create a concise summary of the user's feedback. Format it as a clear, actionable request.

If the conversation was cut short or unclear, summarize what you understood so far.

Keep it brief but include:
1. What they want (feature/change/fix)
2. Why (if mentioned)
3. Any specific details

Format: Start with a one-line summary, then bullet points for details if needed.`

export async function POST(request: NextRequest) {
  try {
    const body: FeedbackRequest = await request.json()
    const { messages, action } = body

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'Messages required' }, { status: 400 })
    }

    if (action === 'summarize') {
      const summaryResponse = await getAnthropic().messages.create({
        model: ANTHROPIC_SONNET_MODEL,
        max_tokens: 500,
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [
          ...messages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          { role: 'user', content: 'Please summarize the feedback from this conversation.' },
        ],
      })

      const summary = summaryResponse.content[0].type === 'text'
        ? summaryResponse.content[0].text
        : 'Feedback was submitted but summary could not be generated.'

      // Store in database and send notification
      try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          // Insert feedback record
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabase as any
          await db.from('feedback_requests').insert({
            user_id: user.id,
            summary,
          })

          // Send push notification to Dan
          const adminUserId = process.env.FEEDBACK_ADMIN_USER_ID
          if (adminUserId) {
            await sendPushToUser(asTypedClient(supabase), adminUserId, {
              title: 'New feedback from a Rise user',
              body: summary.length > 200 ? summary.substring(0, 200) + '...' : summary,
              url: '/feedback',
              tag: 'rise-feedback',
            })
          }
        }
      } catch (dbError) {
        console.error('Error storing feedback:', dbError)
      }

      return Response.json({ summary })
    }

    // Regular chat flow
    const response = await getAnthropic().messages.create({
      model: ANTHROPIC_SONNET_MODEL,
      max_tokens: 300,
      system: CHAT_SYSTEM_PROMPT,
      messages: messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    })

    const assistantMessage = response.content[0].type === 'text'
      ? response.content[0].text
      : ''

    const lowerMessage = assistantMessage.toLowerCase()
    const isComplete =
      lowerMessage.includes('pass this to dan') ||
      lowerMessage.includes("i'll let dan know") ||
      lowerMessage.includes("let dan know") ||
      lowerMessage.includes("i'll pass this") ||
      (lowerMessage.includes('got it') && lowerMessage.includes('dan'))

    return Response.json({
      message: assistantMessage,
      isComplete,
    })
  } catch (error) {
    console.error('Feedback chat error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
