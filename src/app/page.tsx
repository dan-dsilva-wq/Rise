import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardContent } from '@/components/dashboard/DashboardContent'
import type { DailyLog, DailyPrompt, Profile, Project } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const today = new Date().toISOString().split('T')[0]

  // Fetch data in parallel for faster loading
  const [profileResult, promptsResult, projectsResult, todayLogResult] = await Promise.all([
    // Get user profile
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single(),

    // Get daily prompts
    supabase
      .from('daily_prompts')
      .select('*')
      .eq('is_active', true),

    // Get user's active projects
    supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['discovery', 'planning', 'building'])
      .order('updated_at', { ascending: false }),

    // Get today's daily log (needed for evening nudge + morning check-in state)
    supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('log_date', today)
      .single(),
  ])

  const profile = profileResult.data as Profile | null
  if (profile && profile.has_onboarded === false) {
    redirect('/onboarding')
  }
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
