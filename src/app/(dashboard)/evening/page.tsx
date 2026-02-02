import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EveningContent } from '@/components/evening/EveningContent'

export default async function EveningPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Get today's log
  const today = new Date().toISOString().split('T')[0]
  const { data: todayLog } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', user.id)
    .eq('log_date', today)
    .single()

  return (
    <EveningContent
      profile={profile}
      todayLog={todayLog}
    />
  )
}
