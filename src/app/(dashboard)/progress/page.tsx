import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProgressContent } from '@/components/progress/ProgressContent'

export default async function ProgressPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get recent logs (last 30 days)
  const { data: recentLogs } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('log_date', { ascending: false })
    .limit(30)

  return (
    <ProgressContent
      recentLogs={recentLogs || []}
    />
  )
}
