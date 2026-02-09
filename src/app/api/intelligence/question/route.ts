import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { sendPushToUser } from '@/lib/notifications/webPush'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import {
  answerProactiveQuestionForUser,
  buildNotificationContextForUser,
  generateGapQuestionForUser,
  listProactiveQuestionsForUser,
  logProactiveQuestionForUser,
  markProactiveQuestionOpenedForUser,
  shouldSendQuestion,
} from '@/services/intelligence'

function asTypedClient(client: Awaited<ReturnType<typeof createClient>>): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const includeHistory = request.nextUrl.searchParams.get('history') === 'true'
    const typedClient = asTypedClient(supabase)

    const [questionResult, notificationContext, history] = await Promise.all([
      generateGapQuestionForUser(typedClient, user.id),
      buildNotificationContextForUser(typedClient, user.id),
      includeHistory ? listProactiveQuestionsForUser(typedClient, user.id, 25) : Promise.resolve([]),
    ])

    const decision = shouldSendQuestion(notificationContext)

    return Response.json({
      question: questionResult,
      shouldSend: decision.shouldSend,
      decision,
      history,
    })
  } catch (error) {
    console.error('Intelligence question GET error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to generate question' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body = (await request.json()) as {
      force?: boolean
      gap?: string
      question?: string
    }

    const typedClient = asTypedClient(supabase)
    const notificationContext = await buildNotificationContextForUser(typedClient, user.id)
    const decision = shouldSendQuestion(notificationContext)

    if (!body.force && !decision.shouldSend) {
      return Response.json(
        {
          error: 'Not eligible to send a proactive question right now',
          decision,
        },
        { status: 429 }
      )
    }

    const generated = body.gap?.trim() && body.question?.trim()
      ? {
        gap: body.gap.trim(),
        question: body.question.trim(),
        rawResponse: 'Provided by caller',
        source: 'fallback' as const,
      }
      : await generateGapQuestionForUser(typedClient, user.id)

    const record = await logProactiveQuestionForUser(typedClient, user.id, {
      gapIdentified: generated.gap,
      question: generated.question,
    })

    let pushDelivery = null
    try {
      pushDelivery = await sendPushToUser(typedClient, user.id, {
        title: 'Rise check-in',
        body: generated.question,
        url: '/',
        tag: `proactive-question-${record.id}`,
        requireInteraction: true,
        data: {
          source: 'proactive-question',
          questionId: record.id,
        },
      })
    } catch (pushError) {
      console.error('Failed to send proactive push notification:', pushError)
    }

    return Response.json({
      sent: true,
      question: generated,
      record,
      decision,
      pushDelivery,
    })
  } catch (error) {
    console.error('Intelligence question POST error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to send proactive question' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body = (await request.json()) as {
      questionId?: string
      action?: 'opened' | 'answered'
      answer?: string
      qualityScore?: number
    }

    const questionId = body.questionId?.trim()
    if (!questionId || !body.action) {
      return Response.json(
        { error: 'questionId and action are required' },
        { status: 400 }
      )
    }

    const typedClient = asTypedClient(supabase)

    if (body.action === 'opened') {
      const updated = await markProactiveQuestionOpenedForUser(typedClient, user.id, questionId)
      if (!updated) {
        return Response.json({ error: 'Question not found' }, { status: 404 })
      }
      return Response.json({ record: updated })
    }

    if (!body.answer?.trim()) {
      return Response.json({ error: 'answer is required for action=answered' }, { status: 400 })
    }

    const updated = await answerProactiveQuestionForUser(typedClient, user.id, {
      questionId,
      answer: body.answer.trim(),
      qualityScore: body.qualityScore,
    })

    if (!updated) {
      return Response.json({ error: 'Question not found' }, { status: 404 })
    }

    return Response.json({ record: updated })
  } catch (error) {
    console.error('Intelligence question PATCH error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to update proactive question' },
      { status: 500 }
    )
  }
}
