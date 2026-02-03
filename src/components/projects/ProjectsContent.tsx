'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Compass, Plus, ChevronRight, Target, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { useProjects } from '@/lib/hooks/useProject'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Project, Milestone } from '@/lib/supabase/types'

interface ProjectsContentProps {
  profile: Profile | null
  initialProjects: Project[]
}

interface ProjectWithMilestone extends Project {
  activeMilestone?: Milestone | null
}

export function ProjectsContent({
  profile: initialProfile,
  initialProjects,
}: ProjectsContentProps) {
  const router = useRouter()
  const { user, profile } = useUser()
  const { projects, loading, createProject } = useProjects(user?.id, initialProjects)
  const [isCreating, setIsCreating] = useState(false)
  const [projectsWithMilestones, setProjectsWithMilestones] = useState<ProjectWithMilestone[]>([])
  const supabase = createClient()

  // Fetch active milestone for each project
  useEffect(() => {
    const fetchMilestones = async () => {
      const enhanced: ProjectWithMilestone[] = []
      for (const project of projects) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('milestones')
          .select('*')
          .eq('project_id', project.id)
          .eq('focus_level', 'active')
          .neq('status', 'completed')
          .neq('status', 'discarded')
          .limit(1)
          .single()

        enhanced.push({
          ...project,
          activeMilestone: data as Milestone | null,
        })
      }
      setProjectsWithMilestones(enhanced)
    }

    if (projects.length > 0) {
      fetchMilestones()
    } else {
      setProjectsWithMilestones([])
    }
  }, [projects, supabase])

  const currentProfile = profile || initialProfile
  const activeProjects = projectsWithMilestones.filter(p => ['discovery', 'planning', 'building'].includes(p.status))

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

  // If only one active project, show it prominently
  const singleProject = activeProjects.length === 1 ? activeProjects[0] : null

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header - Minimal */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-slate-100">Projects</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Single Project View - Super Direct */}
        {singleProject && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link href={`/projects/${singleProject.id}`}>
              <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 overflow-hidden">
                {/* Project Header */}
                <div className="p-5 border-b border-slate-700/50">
                  <h2 className="text-xl font-bold text-white mb-1">{singleProject.name}</h2>
                  {singleProject.description && (
                    <p className="text-sm text-slate-400 line-clamp-1">{singleProject.description}</p>
                  )}
                </div>

                {/* Active Milestone - THE THING TO DO */}
                <div className="p-5 bg-teal-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-teal-400" />
                    <span className="text-xs font-medium text-teal-400 uppercase tracking-wide">Current Objective</span>
                  </div>

                  {singleProject.activeMilestone ? (
                    <p className="text-lg font-semibold text-white">
                      {singleProject.activeMilestone.title}
                    </p>
                  ) : (
                    <p className="text-slate-500 italic">No active milestone set</p>
                  )}
                </div>

                {/* Action */}
                <div className="p-4 flex items-center justify-between bg-slate-800/50">
                  <span className="text-sm text-slate-400">Tap to continue</span>
                  <ChevronRight className="w-5 h-5 text-teal-400" />
                </div>
              </div>
            </Link>

            {/* Quick action to work with AI */}
            {singleProject.activeMilestone && (
              <Link href={`/projects/${singleProject.id}/milestone/${singleProject.activeMilestone.id}`}>
                <div className="mt-3 p-4 rounded-xl bg-gradient-to-r from-teal-500/10 to-emerald-500/10 border border-teal-500/20 flex items-center gap-3 hover:border-teal-500/40 transition-colors">
                  <div className="p-2 rounded-lg bg-teal-500/20">
                    <Sparkles className="w-5 h-5 text-teal-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-white">Work on this with AI</p>
                    <p className="text-sm text-slate-400">Get help completing your objective</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-500" />
                </div>
              </Link>
            )}
          </motion.div>
        )}

        {/* Multiple Projects View */}
        {activeProjects.length > 1 && (
          <div className="space-y-3">
            {activeProjects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link href={`/projects/${project.id}`}>
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-teal-500/30 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white truncate">{project.name}</h3>

                        {/* Show active milestone */}
                        {project.activeMilestone ? (
                          <div className="mt-2 flex items-center gap-2">
                            <Target className="w-3 h-3 text-teal-400 flex-shrink-0" />
                            <span className="text-sm text-slate-300 truncate">
                              {project.activeMilestone.title}
                            </span>
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-slate-500">No active objective</p>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-600 flex-shrink-0 mt-1" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {/* Start New Project - subtle */}
        {projectsWithMilestones.length > 0 && (
          <div className="pt-4 border-t border-slate-800">
            <div className="flex gap-2">
              <Link href="/path-finder" className="flex-1">
                <button className="w-full px-3 py-3 text-sm text-slate-400 hover:text-slate-200 bg-slate-800/30 hover:bg-slate-800/50 rounded-xl transition-colors flex items-center justify-center gap-2">
                  <Compass className="w-4 h-4" />
                  New via Path Finder
                </button>
              </Link>
              <button
                onClick={handleCreateProject}
                disabled={isCreating}
                className="flex-1 px-3 py-3 text-sm text-slate-400 hover:text-slate-200 bg-slate-800/30 hover:bg-slate-800/50 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Blank Project
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {projectsWithMilestones.length === 0 && !loading && (
          <Card className="text-center py-12">
            <div className="text-4xl mb-4">🚀</div>
            <h3 className="text-lg font-semibold text-white mb-2">No projects yet</h3>
            <p className="text-sm text-slate-400 mb-6">
              Let's find something to build.
            </p>
            <div className="flex flex-col gap-3 max-w-xs mx-auto">
              <Link href="/path-finder">
                <Button variant="primary" className="w-full">
                  <Compass className="w-4 h-4 mr-2" />
                  Find Your Path
                </Button>
              </Link>
              <Button variant="secondary" onClick={handleCreateProject} isLoading={isCreating}>
                <Plus className="w-4 h-4 mr-2" />
                Blank Project
              </Button>
            </div>
          </Card>
        )}
      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0">
        <BottomNavigation />
      </div>
    </div>
  )
}
