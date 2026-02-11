import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/notifications/webPush'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'
import { buildNotificationContextForUser, shouldSendQuestion } from '@/services/intelligence/notifications'
import { generateGapQuestionForUser } from '@/services/intelligence/gap'
import { logProactiveQuestionForUser } from '@/services/intelligence/proactive-questions'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    // Allow local/manual triggering in non-production when no secret is configured.
    return process.env.NODE_ENV !== 'production'
  }

  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

function uniqueUserIds(rows: Array<{ user_id: string }>): string[] {
  return [...new Set(rows.map(row => row.user_id).filter(Boolean))]
}

interface DispatchResult {
  checkedUsers: number
  eligibleUsers: number
  sentUsers: number
  skippedUsers: number
  failedUsers: number
  errors: Array<{ userId: string; error: string }>
}

async function dispatchForUsers(
  client: SupabaseClient<Database>,
  userIds: string[],
  force = false
): Promise<DispatchResult> {
  const result: DispatchResult = {
    checkedUsers: 0,
    eligibleUsers: 0,
    sentUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    errors: [],
  }

  for (const userId of userIds) {
    result.checkedUsers += 1

    try {
      const notificationContext = await buildNotificationContextForUser(client, userId)
      const decision = shouldSendQuestion(notificationContext)

      if (!force && !decision.shouldSend) {
        result.skippedUsers += 1
        continue
      }

      result.eligibleUsers += 1

      const generated = await generateGapQuestionForUser(client, userId)
      const record = await logProactiveQuestionForUser(client, userId, {
        gapIdentified: generated.gap,
        question: generated.question,
      })

      const delivery = await sendPushToUser(client, userId, {
        title: 'Rise check-in',
        body: generated.question,
        url: '/',
        tag: `proactive-question-${record.id}`,
        requireInteraction: true,
        data: {
          source: 'proactive-question',
          questionId: record.id,
          scheduled: true,
        },
      })

      if (delivery.delivered > 0) {
        result.sentUsers += 1
      } else {
        result.skippedUsers += 1
      }
    } catch (error) {
      result.failedUsers += 1
      result.errors.push({
        userId,
        error: error instanceof Error ? error.message : 'Unknown dispatch error',
      })
    }
  }

  return result
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const force = request.nextUrl.searchParams.get('force') === 'true'

    const { data, error } = await db
      .from('push_subscriptions')
      .select('user_id')
      .eq('is_active', true)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    const userIds = uniqueUserIds((data || []) as Array<{ user_id: string }>)
    const dispatch = await dispatchForUsers(supabase, userIds, force)

    return Response.json({
      success: true,
      force,
      usersWithActiveSubscriptions: userIds.length,
      ...dispatch,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to dispatch notifications' },
      { status: 500 }
    )
  }
}
