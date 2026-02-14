import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLogDateForTimezone } from '@/lib/time/logDate'
import { saveAiInsight } from '@/lib/hooks/aiContextServer'

interface CheckInRequest {
  mood: number
  energy: number
}

export async function POST(request: NextRequest) {
  try {
    const supabaseClient = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = supabaseClient as any
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body: CheckInRequest = await request.json()
    const { mood, energy } = body

    // Validate inputs
    if (typeof mood !== 'number' || mood < 1 || mood > 10) {
      return Response.json({ error: 'Invalid mood value' }, { status: 400 })
    }
    if (typeof energy !== 'number' || energy < 1 || energy > 10) {
      return Response.json({ error: 'Invalid energy value' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .maybeSingle()

    const timezone = profile?.timezone || 'UTC'
    const today = getLogDateForTimezone(timezone)

    // Check if a daily_log already exists for today
    const { data: existingLog } = await supabase
      .from('daily_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('log_date', today)
      .single()

    if (existingLog) {
      // Update existing log
      const { error: updateError } = await supabase
        .from('daily_logs')
        .update({
          morning_mood: mood,
          morning_energy: energy,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLog.id)

      if (updateError) {
        console.error('Error updating daily log:', updateError)
        return Response.json({ error: 'Failed to save check-in' }, { status: 500 })
      }
    } else {
      // Create new daily log
      const { error: insertError } = await supabase
        .from('daily_logs')
        .insert({
          user_id: user.id,
          log_date: today,
          morning_mood: mood,
          morning_energy: energy,
        })

      if (insertError) {
        console.error('Error creating daily log:', insertError)
        return Response.json({ error: 'Failed to save check-in' }, { status: 500 })
      }
    }

    // Save an AI insight for notable mood/energy states
    // This lets Rise remember and reference these moments later
    const isNotablyLow = mood <= 3 || energy <= 3
    const isNotablyHigh = mood >= 9 && energy >= 8

    if (isNotablyLow || isNotablyHigh) {
      const insightContent = isNotablyLow
        ? `Morning check-in on ${today} (${timezone}): User reported ${mood <= 3 ? 'low mood (' + mood + '/10)' : ''}${mood <= 3 && energy <= 3 ? ' and ' : ''}${energy <= 3 ? 'low energy (' + energy + '/10)' : ''}. May need extra support or gentler pacing today.`
        : `Morning check-in on ${today} (${timezone}): User feeling great - mood ${mood}/10, energy ${energy}/10. Good day to tackle challenging work.`

      await saveAiInsight(
        supabaseClient,
        user.id,
        isNotablyLow ? 'blocker' : 'discovery',
        insightContent,
        'morning_checkin',
        {
          importance: isNotablyLow ? 8 : 5,
          expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        }
      )
    }

    return Response.json({ success: true })

  } catch (error) {
    console.error('Morning check-in error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to process check-in' },
      { status: 500 }
    )
  }
}
