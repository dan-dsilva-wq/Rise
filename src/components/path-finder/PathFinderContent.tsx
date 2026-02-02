'use client'

import { useRouter } from 'next/navigation'
import { Settings, TrendingUp, Compass, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { TreeView } from './TreeView'
import { Card } from '@/components/ui/Card'
import { usePathFinder } from '@/lib/hooks/usePathFinder'
import { useUser } from '@/lib/hooks/useUser'
import type { Profile, PathFinderProgress } from '@/lib/supabase/types'
import { getNode } from '@/lib/path-finder/tree-data'
import { createClient } from '@/lib/supabase/client'

interface PathFinderContentProps {
  profile: Profile | null
  initialProgress: PathFinderProgress | null
}

export function PathFinderContent({
  profile: initialProfile,
  initialProgress,
}: PathFinderContentProps) {
  const router = useRouter()
  const { user, profile } = useUser()
  const { currentNodeId, visitedNodes, navigate, selectPath, loading } = usePathFinder(user?.id)
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  const currentProfile = profile || initialProfile

  // Use hook state if loaded, otherwise use initial state
  const displayNodeId = loading
    ? (initialProgress?.current_node_id || 'start')
    : currentNodeId
  const displayVisited = loading
    ? (initialProgress?.visited_nodes || [])
    : visitedNodes

  const handleStartProject = async (nodeId: string) => {
    if (!user?.id) return

    const node = getNode(nodeId)
    if (!node || node.type !== 'suggestion' || !node.suggestion) return

    // Create a new project from the suggestion
    const { data: project, error } = await client
      .from('projects')
      .insert({
        user_id: user.id,
        name: node.suggestion.name,
        description: node.suggestion.description,
        status: 'planning',
        path_node_id: nodeId,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating project:', error)
      return
    }

    // Create milestones from the suggestion
    const milestones = node.suggestion.milestones.map((m, index) => ({
      project_id: project.id,
      user_id: user.id,
      title: m.title,
      description: m.description,
      sort_order: index,
      xp_reward: 100,
    }))

    const { error: milestoneError } = await client
      .from('milestones')
      .insert(milestones)

    if (milestoneError) {
      console.error('Error creating milestones:', milestoneError)
    }

    // Navigate to the new project
    router.push(`/projects/${project.id}`)
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Compass className="w-5 h-5 text-teal-500" />
                Path Finder
              </h1>
              <p className="text-sm text-slate-400">Discover what to build</p>
            </div>
          </div>
          <Link
            href="/settings"
            className="p-2 rounded-full hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-5 h-5 text-slate-400" />
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Intro Card - Only show at start */}
        {displayNodeId === 'start' && displayVisited.length === 0 && (
          <Card className="mb-6">
            <div className="text-center">
              <div className="text-3xl mb-3">🎯</div>
              <h2 className="text-lg font-semibold text-white mb-2">
                Find Your Path to Freedom
              </h2>
              <p className="text-sm text-slate-400">
                Answer a few questions to discover what you should build.
                AI will help you every step of the way.
              </p>
            </div>
          </Card>
        )}

        {/* Tree View */}
        <TreeView
          currentNodeId={displayNodeId}
          visitedNodes={displayVisited}
          onNavigate={navigate}
          onSelectPath={selectPath}
          onStartProject={handleStartProject}
        />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 safe-bottom">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-around">
          <Link
            href="/"
            className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-200"
          >
            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
              <span className="text-xs text-slate-300 font-bold">R</span>
            </div>
            <span className="text-xs">Today</span>
          </Link>

          <Link
            href="/path-finder"
            className="flex flex-col items-center gap-1 text-teal-400"
          >
            <Compass className="w-6 h-6" />
            <span className="text-xs">Path</span>
          </Link>

          <Link
            href="/progress"
            className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-200"
          >
            <TrendingUp className="w-6 h-6" />
            <span className="text-xs">Progress</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
