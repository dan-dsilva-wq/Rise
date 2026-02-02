import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, FolderKanban } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BuilderChat } from '@/components/chat/BuilderChat'
import type { Project, Milestone, ProjectLog } from '@/lib/supabase/types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BuildPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
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

  // Get milestones
  const { data: milestonesData } = await supabase
    .from('milestones')
    .select('*')
    .eq('project_id', id)
    .order('sort_order', { ascending: true })

  const milestones = (milestonesData || []) as Milestone[]

  // Get chat history
  const { data: chatHistoryData } = await supabase
    .from('project_logs')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: true })
    .limit(50)

  const chatHistory = (chatHistoryData || []) as ProjectLog[]

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
        />
      </div>
    </div>
  )
}
