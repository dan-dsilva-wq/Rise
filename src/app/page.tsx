import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardContent } from '@/components/dashboard/DashboardContent'
import type { DailyPrompt, Project } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch data in parallel for faster loading
  const [profileResult, promptsResult, projectsResult] = await Promise.all([
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
  ])

  const profile = profileResult.data
  const prompts = promptsResult.data as DailyPrompt[] | null
  const projects = (projectsResult.data || []) as Project[]

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
      todayLog={null}
      dailyPrompt={dailyPrompt}
      projects={projects}
    />
  )
}
