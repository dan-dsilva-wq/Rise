import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface IncomingPushSubscription {
  endpoint?: string
  expirationTime?: number | null
  keys?: {
    p256dh?: string
    auth?: string
  }
}

interface SubscriptionRequestBody {
  subscription?: IncomingPushSubscription
  userAgent?: string
  endpoint?: string
}

function normalizeUserAgent(input: unknown, fallback: string | null): string | null {
  if (typeof input === 'string' && input.trim().length > 0) {
    return input.trim().slice(0, 500)
  }
  if (typeof fallback === 'string' && fallback.trim().length > 0) {
    return fallback.trim().slice(0, 500)
  }
  return null
}

function parseIncomingSubscription(input: IncomingPushSubscription | undefined): {
  endpoint: string
  p256dh: string
  auth: string
  expirationTime: number | null
} | null {
  if (!input) return null
  const endpoint = input.endpoint?.trim()
  const p256dh = input.keys?.p256dh?.trim()
  const auth = input.keys?.auth?.trim()

  if (!endpoint || !p256dh || !auth) {
    return null
  }

  const expirationTime =
    typeof input.expirationTime === 'number' && Number.isFinite(input.expirationTime)
      ? Math.trunc(input.expirationTime)
      : null

  return {
    endpoint,
    p256dh,
    auth,
    expirationTime,
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { data, error } = await db
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    const records = (data || []) as Array<{ updated_at: string }>

    return Response.json({
      active: records.length > 0,
      count: records.length,
      latestUpdatedAt: records[0]?.updated_at || null,
    })
  } catch (error) {
    console.error('Notifications subscription GET error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch subscriptions' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body = (await request.json()) as SubscriptionRequestBody
    const subscription = parseIncomingSubscription(body.subscription)

    if (!subscription) {
      return Response.json(
        { error: 'Valid push subscription payload is required' },
        { status: 400 }
      )
    }

    const userAgent = normalizeUserAgent(body.userAgent, request.headers.get('user-agent'))

    const { error } = await db
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          expiration_time: subscription.expirationTime,
          user_agent: userAgent,
          is_active: true,
          last_error: null,
        },
        {
          onConflict: 'user_id,endpoint',
          ignoreDuplicates: false,
        }
      )

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Notifications subscription POST error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to save push subscription' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    let body: SubscriptionRequestBody = {}
    try {
      body = (await request.json()) as SubscriptionRequestBody
    } catch {
      body = {}
    }

    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''

    let query = db
      .from('push_subscriptions')
      .update({
        is_active: false,
        last_error: 'Unsubscribed by user',
      })
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (endpoint) {
      query = query.eq('endpoint', endpoint)
    }

    const { data, error } = await query.select('id')

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({
      success: true,
      deactivated: (data || []).length,
    })
  } catch (error) {
    console.error('Notifications subscription DELETE error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to remove push subscription' },
      { status: 500 }
    )
  }
}
