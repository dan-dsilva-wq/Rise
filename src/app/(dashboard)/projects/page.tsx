import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProjectsContent } from '@/components/projects/ProjectsContent'
import type { Project } from '@/lib/supabase/types'

export default async function ProjectsPage() {
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

  // Get projects
  const { data: projectsData } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const projects = (projectsData || []) as Project[]

  return (
    <ProjectsContent
      profile={profile}
      initialProjects={projects}
    />
  )
}
