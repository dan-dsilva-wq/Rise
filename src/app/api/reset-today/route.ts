import { createClient } from '@/lib/supabase/server'

// GET - show what logs exist (for debugging)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Get all logs for this user
    const { data: logs, error } = await supabase
      .from('daily_logs')
      .select('id, log_date, im_up_pressed_at, created_at')
      .eq('user_id', user.id)
      .order('log_date', { ascending: false })
      .limit(10)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    const now = new Date()
    return Response.json({
      user_id: user.id,
      server_time_utc: now.toISOString(),
      server_date_utc: now.toISOString().split('T')[0],
      logs: logs || [],
      log_count: logs?.length || 0
    })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

// POST - delete ALL logs for user (nuclear option)
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // First, get all logs to see what we're deleting
    const { data: existingLogs } = await supabase
      .from('daily_logs')
      .select('id, log_date')
      .eq('user_id', user.id)

    // Delete ALL logs for this user (nuclear option)
    const { error } = await supabase
      .from('daily_logs')
      .delete()
      .eq('user_id', user.id)

    if (error) {
      console.error('Error resetting:', error)
      return Response.json({
        success: false,
        error: error.message,
        existingLogs
      }, { status: 500 })
    }

    return Response.json({
      success: true,
      message: `Deleted ${existingLogs?.length || 0} log(s)`,
      deleted_logs: existingLogs
    })
  } catch (error) {
    console.error('Reset API error:', error)
    return Response.json({
      success: false,
      error: String(error)
    }, { status: 500 })
  }
}
