import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PathFinderContent } from '@/components/path-finder/PathFinderContent'

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

  return <PathFinderContent profile={profile} />
}
