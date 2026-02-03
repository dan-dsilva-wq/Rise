import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProjectDetailContent } from '@/components/projects/ProjectDetailContent'
import type { Project, Milestone } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params
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

  // Get project
  const { data: projectData } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  const project = projectData as Project | null

  if (!project) {
    redirect('/projects')
  }

  // Get milestones
  const { data: milestonesData } = await supabase
    .from('milestones')
    .select('*')
    .eq('project_id', id)
    .order('sort_order', { ascending: true })

  const milestones = (milestonesData || []) as Milestone[]

  return (
    <ProjectDetailContent
      profile={profile}
      initialProject={project}
      initialMilestones={milestones}
    />
  )
}
