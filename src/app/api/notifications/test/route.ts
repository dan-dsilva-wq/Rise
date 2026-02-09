import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { sendPushToUser, hasWebPushConfiguration } from '@/lib/notifications/webPush'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

function asTypedClient(client: Awaited<ReturnType<typeof createClient>>): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

interface TestNotificationBody {
  title?: string
  body?: string
  url?: string
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

    if (!hasWebPushConfiguration()) {
      return Response.json(
        {
          error: 'Push notifications are not configured on the server.',
          requiredEnv: ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'],
        },
        { status: 503 }
      )
    }

    let body: TestNotificationBody = {}
    try {
      body = (await request.json()) as TestNotificationBody
    } catch {
      body = {}
    }

    const title = body.title?.trim() || 'Rise notification test'
    const message = body.body?.trim() || 'Push notifications are connected and working.'
    const url = body.url?.trim() || '/settings'

    const delivery = await sendPushToUser(asTypedClient(supabase), user.id, {
      title,
      body: message,
      url,
      tag: 'rise-test-notification',
      data: { source: 'notification-test' },
    })

    if (delivery.attempted === 0 && !delivery.skipped) {
      return Response.json(
        {
          success: false,
          delivery,
          error: 'No active subscriptions were found for this user.',
        },
        { status: 409 }
      )
    }

    return Response.json({
      success: delivery.delivered > 0,
      delivery,
    })
  } catch (error) {
    console.error('Notifications test POST error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to send test notification' },
      { status: 500 }
    )
  }
}
