'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Compass, FolderKanban, Loader2, Plus, Target } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useProjects } from '@/lib/hooks/useProject'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import type { Milestone, Profile, Project } from '@/lib/supabase/types'

interface ProjectsContentProps {
  profile: Profile | null
  initialProjects: Project[]
}

type FocusMilestone = Pick<
  Milestone,
  'id' | 'project_id' | 'title' | 'status' | 'focus_level' | 'sort_order'
>

interface ProjectWithFocus extends Project {
  focusMilestone: FocusMilestone | null
}

const ACTIONABLE_STATUSES: Milestone['status'][] = ['pending', 'in_progress']

const FOCUS_PRIORITY: Record<Milestone['focus_level'], number> = {
  active: 0,
  next: 1,
  backlog: 2,
}

function getClient() {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any
}

function compareByFocus(a: FocusMilestone, b: FocusMilestone) {
  const focusDiff = FOCUS_PRIORITY[a.focus_level] - FOCUS_PRIORITY[b.focus_level]
  if (focusDiff !== 0) return focusDiff
  return a.sort_order - b.sort_order
}

export function ProjectsContent({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  profile: _initialProfile,
  initialProjects,
}: ProjectsContentProps) {
  const router = useRouter()
  const { user } = useUser()
  const { projects, loading, createProject } = useProjects(user?.id, initialProjects)

  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingFocus, setIsLoadingFocus] = useState(true)
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [workspaceProjects, setWorkspaceProjects] = useState<ProjectWithFocus[]>(
    () => initialProjects.map(project => ({ ...project, focusMilestone: null }))
  )

  const displayProjects = projects.length > 0 ? projects : initialProjects
  const projectIds = useMemo(() => displayProjects.map(project => project.id), [displayProjects])

  useEffect(() => {
    const fetchFocusMilestones = async () => {
      if (displayProjects.length === 0) {
        setWorkspaceProjects([])
        setIsLoadingFocus(false)
        return
      }

      setIsLoadingFocus(true)
      const client = getClient()

      try {
        const { data: milestoneRows, error } = await client
          .from('milestones')
          .select('id, project_id, title, status, focus_level, sort_order')
          .in('project_id', projectIds)
          .in('status', ACTIONABLE_STATUSES)
          .order('sort_order', { ascending: true })

        if (error) {
          throw error
        }

        const focusByProject = new Map<string, FocusMilestone>()

        for (const milestone of (milestoneRows || []) as FocusMilestone[]) {
          const current = focusByProject.get(milestone.project_id)
          if (!current || compareByFocus(milestone, current) < 0) {
            focusByProject.set(milestone.project_id, milestone)
          }
        }

        const merged = displayProjects.map(project => ({
          ...project,
          focusMilestone: focusByProject.get(project.id) || null,
        }))

        setWorkspaceProjects(merged)
      } catch (error) {
        console.error('Failed to fetch project focus milestones:', error)
        setWorkspaceProjects(displayProjects.map(project => ({ ...project, focusMilestone: null })))
      } finally {
        setIsLoadingFocus(false)
      }
    }

    fetchFocusMilestones()
  }, [displayProjects, projectIds])

  const handleCreateProject = async () => {
    setIsCreating(true)
    const project = await createProject({
      name: 'New Project',
      description: '',
      status: 'discovery',
    })
    setIsCreating(false)

    if (project) {
      router.push(`/projects/${project.id}`)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-xl mx-auto px-5 py-4">
          <h1 className="text-xl font-semibold text-slate-100">Workspace</h1>
          <p className="text-sm text-slate-400">
            Secondary view for managing project structure.
          </p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-5 py-6 space-y-5">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <p className="text-sm text-slate-300">
            Daily execution lives on the <span className="text-teal-300">Today</span> focus card.
            Open this workspace only when you need to reorganize projects or milestones.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <Link href="/" className="sm:flex-1">
              <Button variant="primary" className="w-full">
                Back to Focus
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/path-finder" className="sm:flex-1">
              <Button variant="secondary" className="w-full">
                <Compass className="w-4 h-4 mr-2" />
                Path Finder
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="bg-slate-800/40 border-slate-700/50">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="ghost"
              className="sm:flex-1"
              onClick={() => setShowWorkspace(!showWorkspace)}
            >
              <FolderKanban className="w-4 h-4 mr-2" />
              {showWorkspace ? 'Hide Project Workspace' : `Show Project Workspace (${workspaceProjects.length})`}
            </Button>
            <Button
              variant="secondary"
              className="sm:flex-1"
              onClick={handleCreateProject}
              isLoading={isCreating}
              loadingText="Creating project..."
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              New Project
            </Button>
          </div>
        </Card>

        {showWorkspace && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {isLoadingFocus && (
              <Card className="text-center py-8">
                <p className="text-slate-400 text-sm">Loading project workspace...</p>
              </Card>
            )}

            {!isLoadingFocus && workspaceProjects.length === 0 && !loading && (
              <Card className="text-center py-10">
                <p className="text-slate-200">No projects yet.</p>
                <p className="text-slate-500 text-sm mt-1">Create one here or via Path Finder.</p>
              </Card>
            )}

            {!isLoadingFocus && workspaceProjects.map(project => (
              <Card key={project.id} className="bg-slate-800/60 border-slate-700/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg text-slate-100 font-medium truncate">{project.name}</h2>
                    {project.focusMilestone ? (
                      <p className="mt-2 text-sm text-slate-300 flex items-center gap-2">
                        <Target className="w-4 h-4 text-teal-300 flex-shrink-0" />
                        <span className="truncate">{project.focusMilestone.title}</span>
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">No focus milestone selected yet.</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  {project.focusMilestone ? (
                    <Link
                      href={`/projects/${project.id}/milestone/${project.focusMilestone.id}`}
                      className="sm:flex-1"
                    >
                      <Button variant="primary" className="w-full">
                        Open Focus
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/path-finder" className="sm:flex-1">
                      <Button variant="primary" className="w-full">
                        Set Focus in Path Finder
                      </Button>
                    </Link>
                  )}

                  <Link href={`/projects/${project.id}`} className="sm:flex-1">
                    <Button variant="ghost" className="w-full">
                      Manage Structure
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </motion.section>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0">
        <BottomNavigation />
      </div>
    </div>
  )
}
