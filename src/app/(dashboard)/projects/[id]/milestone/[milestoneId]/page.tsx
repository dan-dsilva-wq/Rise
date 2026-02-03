import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MilestoneModeChat } from '@/components/milestone-mode/MilestoneModeChat'
import type { Milestone, Project, MilestoneConversation, MilestoneMessage } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

interface MilestoneWithProject extends Milestone {
  project: Project
  allMilestones: Milestone[]
}

export default async function MilestoneModePage({
  params
}: {
  params: Promise<{ id: string; milestoneId: string }>
}) {
  const { id: projectId, milestoneId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (projectError || !project) {
    redirect('/projects')
  }

  // Fetch milestone
  const { data: milestone, error: milestoneError } = await supabase
    .from('milestones')
    .select('*')
    .eq('id', milestoneId)
    .eq('project_id', projectId)
    .single()

  if (milestoneError || !milestone) {
    redirect(`/projects/${projectId}`)
  }

  // Fetch all milestones for context
  const { data: allMilestones } = await supabase
    .from('milestones')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  // Fetch or check for existing conversation
  // Note: Tables may not exist yet - handle gracefully
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  let conversation: MilestoneConversation | null = null
  let messages: MilestoneMessage[] = []

  try {
    const { data: existingConvo } = await client
      .from('milestone_conversations')
      .select('*')
      .eq('milestone_id', milestoneId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (existingConvo) {
      conversation = existingConvo as MilestoneConversation

      // Fetch messages
      const { data: msgs } = await client
        .from('milestone_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })

      messages = (msgs as MilestoneMessage[]) || []
    } else {
      // Create new conversation
      const { data: newConvo } = await client
        .from('milestone_conversations')
        .insert({
          milestone_id: milestoneId,
          user_id: user.id,
        })
        .select()
        .single()

      conversation = newConvo as MilestoneConversation
    }
  } catch {
    // Tables may not exist yet - conversation will be null
    // The component will handle this gracefully
  }

  const milestoneWithProject: MilestoneWithProject = {
    ...(milestone as Milestone),
    project: project as Project,
    allMilestones: (allMilestones as Milestone[]) || [],
  }

  return (
    <MilestoneModeChat
      userId={user.id}
      milestone={milestoneWithProject}
      initialConversation={conversation}
      initialMessages={messages}
    />
  )
}
