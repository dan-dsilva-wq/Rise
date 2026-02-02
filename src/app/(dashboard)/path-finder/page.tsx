import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PathFinderContent } from '@/components/path-finder/PathFinderContent'
import type { PathFinderProgress } from '@/lib/supabase/types'

export default async function PathFinderPage() {
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

  // Get path finder progress
  const { data: progressData } = await supabase
    .from('path_finder_progress')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const progress = progressData as PathFinderProgress | null

  return (
    <PathFinderContent
      profile={profile}
      initialProgress={progress}
    />
  )
}
