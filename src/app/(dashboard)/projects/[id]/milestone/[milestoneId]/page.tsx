import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MilestoneModeChat } from '@/components/milestone-mode/MilestoneModeChat'
import { generateMilestoneOpener, type MilestoneOpenerSignals } from '@/lib/ai/memoryWeaver'
import type { Milestone, Project, MilestoneConversation, MilestoneMessage, MilestoneStep } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

interface MilestoneWithProject extends Milestone {
  project: Project
  allMilestones: Milestone[]
  steps: MilestoneStep[]
}

export default async function MilestoneModePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; milestoneId: string }>
  searchParams: Promise<{ mode?: string }>
}) {
  const { id: projectId, milestoneId } = await params
  const resolvedSearchParams = await searchParams
  const initialApproach = resolvedSearchParams.mode === 'do-it' ? 'do-it' : 'guide'
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
  let steps: MilestoneStep[] = []

  // Fetch milestone steps
  try {
    const { data: stepsData } = await client
      .from('milestone_steps')
      .select('*')
      .eq('milestone_id', milestoneId)
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })

    steps = (stepsData as MilestoneStep[]) || []
  } catch {
    // Table may not exist yet
  }

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
    steps,
  }

  // ─── Build contextual opener + quick prompts for new/empty conversations ───
  // Only generate if conversation has no messages (first visit or fresh convo)
  let contextualOpener: string | null = null
  let contextualQuickPrompts: string[] | null = null
  if (messages.length === 0) {
    try {
      // Fetch signals needed for a memory-aware opener in parallel
      const currentStep = steps.find(s => !s.is_completed)
      const completedSteps = steps.filter(s => s.is_completed).length

      // First, get all conversation IDs for this milestone (needed for the message query)
      const { data: convIds } = await client
        .from('milestone_conversations')
        .select('id')
        .eq('milestone_id', milestoneId)
        .eq('user_id', user.id)

      const conversationIds = (convIds || []).map((c: { id: string }) => c.id)

      // Now fetch the opener signals in parallel
      const [lastMilestoneMsg, todayLogResult, profileResult] = await Promise.all([
        // Last user message in this milestone's conversation(s)
        conversationIds.length > 0
          ? client
              .from('milestone_messages')
              .select('content, created_at')
              .eq('user_id', user.id)
              .eq('role', 'user')
              .in('conversation_id', conversationIds)
              .order('created_at', { ascending: false })
              .limit(1)
          : Promise.resolve({ data: [] }),
        // Today's daily log for mood/energy
        client
          .from('daily_logs')
          .select('morning_mood, morning_energy, evening_mood, evening_energy')
          .eq('user_id', user.id)
          .order('log_date', { ascending: false })
          .limit(1),
        // Display name
        client
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .single(),
      ])

      const lastMsg = lastMilestoneMsg.data?.[0] as { content: string; created_at: string } | undefined
      const todayLog = todayLogResult.data?.[0] as {
        morning_mood: number | null; morning_energy: number | null
        evening_mood: number | null; evening_energy: number | null
      } | undefined

      // Build the opener signals
      const openerSignals: MilestoneOpenerSignals = {
        milestoneTitle: (milestone as Milestone).title,
        projectName: (project as Project).name,
        currentStepText: currentStep?.text || null,
        completedSteps,
        totalSteps: steps.length,
        displayName: profileResult.data?.display_name || null,
      }

      // Add last message context if available
      if (lastMsg) {
        const hoursAgo = (Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60)
        openerSignals.lastMilestoneMessage = lastMsg.content
        openerSignals.lastMilestoneMessageHoursAgo = Math.round(hoursAgo)
      }

      // Add mood/energy if available (prefer evening readings, fall back to morning)
      if (todayLog) {
        openerSignals.currentMood = todayLog.evening_mood ?? todayLog.morning_mood ?? null
        openerSignals.currentEnergy = todayLog.evening_energy ?? todayLog.morning_energy ?? null
      }

      const openerResult = generateMilestoneOpener(openerSignals)
      contextualOpener = openerResult.opener
      contextualQuickPrompts = openerResult.quickPrompts
    } catch (err) {
      console.error('Error building milestone opener:', err)
      // Falls back to null — MilestoneModeChat will use its default
    }
  }

  return (
    <MilestoneModeChat
      userId={user.id}
      milestone={milestoneWithProject}
      initialConversation={conversation}
      initialMessages={messages}
      initialApproach={initialApproach}
      contextualOpener={contextualOpener}
      contextualQuickPrompts={contextualQuickPrompts}
    />
  )
}
