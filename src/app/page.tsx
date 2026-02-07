import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardContent } from '@/components/dashboard/DashboardContent'
import type { DailyLog, DailyPrompt, Profile, Project } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

function getDateInTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date())
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const profileResult = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const profile = profileResult.data as Profile | null
  const timezone = profile?.timezone || 'UTC'
  const today = getDateInTimezone(timezone)

  // Fetch remaining data in parallel
  const [promptsResult, projectsResult, todayLogResult] = await Promise.all([
    supabase
      .from('daily_prompts')
      .select('*')
      .eq('is_active', true),

    supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['discovery', 'planning', 'building'])
      .order('updated_at', { ascending: false }),

    supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('log_date', today)
      .single(),
  ])

  const prompts = promptsResult.data as DailyPrompt[] | null
  const projects = (projectsResult.data || []) as Project[]
  const todayLog = (todayLogResult.data as DailyLog | null) ?? null

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
      projects={projects}
    />
  )
}
