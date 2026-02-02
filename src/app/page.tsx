import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardContent } from '@/components/dashboard/DashboardContent'
import type { DailyPrompt, DailyMission } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
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

  // Get today's primary mission
  const { data: missionsData } = await supabase
    .from('daily_missions')
    .select('*')
    .eq('user_id', user.id)
    .eq('mission_date', today)
    .in('status', ['pending', 'in_progress'])
    .order('priority', { ascending: true })
    .limit(1)

  const missions = (missionsData || []) as DailyMission[]
  const primaryMission = missions[0] || null

  // Get a daily prompt
  const { data: prompts } = await supabase
    .from('daily_prompts')
    .select('*')
    .eq('is_active', true) as { data: DailyPrompt[] | null }

  let dailyPrompt = { prompt_text: 'Today is a new opportunity.', author: null as string | null }
  if (prompts && prompts.length > 0) {
    const dayIndex = new Date().getDate() % prompts.length
    const selected = prompts[dayIndex]
    dailyPrompt = {
      prompt_text: selected.prompt_text,
      author: selected.author,
    }
  }

  return (
    <DashboardContent
      profile={profile}
      todayLog={todayLog}
      dailyPrompt={dailyPrompt}
      initialMission={primaryMission}
    />
  )
}
