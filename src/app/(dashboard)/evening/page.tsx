import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EveningContent } from '@/components/evening/EveningContent'
import type { DailyLog, Profile } from '@/lib/supabase/types'
import { getLogDateForTimezone } from '@/lib/time/logDate'

export default async function EveningPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile
  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const profile = (profileData as Profile | null) ?? null

  // Get today's log
  const timezone = profile?.timezone || 'UTC'
  const today = getLogDateForTimezone(timezone)
  const { data: todayLogData } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', user.id)
    .eq('log_date', today)
    .single()
  const todayLog = (todayLogData as DailyLog | null) ?? null

  return (
    <EveningContent
      profile={profile}
      todayLog={todayLog}
    />
  )
}
