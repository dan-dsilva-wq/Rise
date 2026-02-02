import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProgressContent } from '@/components/progress/ProgressContent'

export default async function ProgressPage() {
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

  // Get recent logs (last 30 days)
  const { data: recentLogs } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('log_date', { ascending: false })
    .limit(30)

  // Get user achievements
  const { data: userAchievements } = await supabase
    .from('user_achievements')
    .select('*, achievements(*)')
    .eq('user_id', user.id)

  // Get all achievements
  const { data: allAchievements } = await supabase
    .from('achievements')
    .select('*')
    .order('display_order')

  return (
    <ProgressContent
      profile={profile}
      recentLogs={recentLogs || []}
      userAchievements={userAchievements || []}
      allAchievements={allAchievements || []}
    />
  )
}
