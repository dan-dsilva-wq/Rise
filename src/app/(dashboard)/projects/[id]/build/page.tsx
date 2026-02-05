import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, FolderKanban } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BuilderChat } from '@/components/chat/BuilderChat'
import { generateBuilderChatOpener, buildGreetingSignals, type BuilderChatOpenerSignals } from '@/lib/ai/memoryWeaver'
import type { Project, Milestone, ProjectLog } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BuildPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

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

  // Get milestones, chat history, profile, daily log, and last user message in parallel
  const [milestonesResult, chatHistoryResult, profileResult, todayLogResult, lastProjectMsgResult] = await Promise.all([
    supabase
      .from('milestones')
      .select('*')
      .eq('project_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('project_logs')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: true })
      .limit(50),
    client
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single(),
    client
      .from('daily_logs')
      .select('morning_mood, morning_energy, evening_mood, evening_energy')
      .eq('user_id', user.id)
      .order('log_date', { ascending: false })
      .limit(1),
    // Last user message for this project (for return-context even with chat history)
    client
      .from('project_logs')
      .select('content, created_at')
      .eq('project_id', id)
      .eq('user_id', user.id)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  const milestones = (milestonesResult.data || []) as Milestone[]
  const chatHistory = (chatHistoryResult.data || []) as ProjectLog[]

  // Shared data for both new and returning conversations
  const activeMilestone = milestones.find(m => m.focus_level === 'active')
    || milestones.find(m => m.focus_level === 'next')
    || milestones.find(m => m.status !== 'completed' && m.status !== 'discarded' && m.status !== 'idea')

  const completedMilestones = milestones.filter(m => m.status === 'completed').length
  const totalMilestones = milestones.filter(m => m.status !== 'idea').length

  const lastMsg = lastProjectMsgResult.data?.[0] as { content: string; created_at: string } | undefined
  const todayLog = todayLogResult.data?.[0] as {
    morning_mood: number | null; morning_energy: number | null
    evening_mood: number | null; evening_energy: number | null
  } | undefined

  // Build memory signals for cross-conversation awareness (shared utility from memoryWeaver)
  const memorySignals = await buildGreetingSignals(supabase, user.id).catch(err => {
    console.error('Error building memory signals for builder chat:', err)
    return undefined
  })

  // ─── Build contextual opener for empty conversations ───
  let contextualOpener: string | null = null
  let contextualQuickPrompts: string[] | null = null

  // ─── Build return context for conversations with history ───
  let returnContext: { message: string; milestone: string | null } | null = null

  if (chatHistory.length === 0) {
    // New conversation: generate full opener
    try {
      const openerSignals: BuilderChatOpenerSignals = {
        projectName: project.name,
        projectStatus: project.status,
        activeMilestoneTitle: activeMilestone?.title || null,
        completedMilestones,
        totalMilestones,
        displayName: profileResult.data?.display_name || null,
        memorySignals,
      }

      // Add last message context if available
      if (lastMsg) {
        const hoursAgo = (Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60)
        openerSignals.lastProjectMessage = lastMsg.content
        openerSignals.lastProjectMessageHoursAgo = Math.round(hoursAgo)
      }

      // Add mood/energy if available
      if (todayLog) {
        openerSignals.currentMood = todayLog.evening_mood ?? todayLog.morning_mood ?? null
        openerSignals.currentEnergy = todayLog.evening_energy ?? todayLog.morning_energy ?? null
      }

      const result = generateBuilderChatOpener(openerSignals)
      contextualOpener = result.opener
      contextualQuickPrompts = result.quickPrompts
    } catch (err) {
      console.error('Error building chat opener:', err)
      // Falls back to null — BuilderChat will use its default
    }
  } else {
    // Returning conversation: build a lightweight continuity context
    try {
      if (lastMsg) {
        const hoursAgo = (Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60)
        const name = profileResult.data?.display_name || 'there'

        if (hoursAgo >= 4) {
          // Only show return context if they've been away for a while
          let returnMessage: string

          if (hoursAgo >= 48) {
            const days = Math.round(hoursAgo / 24)
            returnMessage = `It's been ${days} days since we last worked here. ${activeMilestone ? `Your active milestone: **${activeMilestone.title}**` : `${completedMilestones}/${totalMilestones} milestones done`} — welcome back, ${name}.`
          } else if (hoursAgo >= 12) {
            // Yesterday or overnight gap
            if (activeMilestone) {
              returnMessage = `Welcome back, ${name}. Your focus: **${activeMilestone.title}** (${completedMilestones}/${totalMilestones} milestones done)`
            } else {
              returnMessage = `Welcome back, ${name}. ${completedMilestones}/${totalMilestones} milestones done — where do you want to pick up?`
            }
          } else {
            // 4-12 hours gap — brief acknowledgement
            returnMessage = activeMilestone
              ? `Still on it — your focus: **${activeMilestone.title}**`
              : `Back to it. ${completedMilestones}/${totalMilestones} milestones done.`
          }

          returnContext = {
            message: returnMessage,
            milestone: activeMilestone?.title || null,
          }
        }
      }
    } catch (err) {
      console.error('Error building return context:', err)
      // Continue without return context
    }
  }

  return (
    <div className="h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/projects/${id}`}
              className="p-2 -ml-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                AI Builder
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <FolderKanban className="w-3 h-3" />
                {project.name}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Chat Area - Takes remaining height */}
      <div className="flex-1 overflow-hidden max-w-4xl w-full mx-auto">
        <BuilderChat
          project={project}
          milestones={milestones}
          initialMessages={chatHistory}
          contextualOpener={contextualOpener}
          contextualQuickPrompts={contextualQuickPrompts}
          returnContext={returnContext}
        />
      </div>
    </div>
  )
}
