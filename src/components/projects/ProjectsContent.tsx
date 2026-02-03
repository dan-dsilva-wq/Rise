'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Settings, Compass, FolderKanban, Plus, Rocket } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ProjectCard } from './ProjectCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { useProjects } from '@/lib/hooks/useProject'
import { useUser } from '@/lib/hooks/useUser'
import type { Profile, Project } from '@/lib/supabase/types'

interface ProjectsContentProps {
  profile: Profile | null
  initialProjects: Project[]
}

export function ProjectsContent({
  profile: initialProfile,
  initialProjects,
}: ProjectsContentProps) {
  const router = useRouter()
  const { user, profile } = useUser()
  const { projects, loading, createProject } = useProjects(user?.id, initialProjects)
  const [isCreating, setIsCreating] = useState(false)

  const currentProfile = profile || initialProfile
  // Always use projects from hook - it's initialized with initialProjects
  const displayProjects = projects

  // Separate projects by status
  const activeProjects = displayProjects.filter(p => ['discovery', 'planning', 'building'].includes(p.status))
  const launchedProjects = displayProjects.filter(p => p.status === 'launched')
  const pausedProjects = displayProjects.filter(p => p.status === 'paused')

  const handleCreateProject = async () => {
    setIsCreating(true)
    const project = await createProject({
      name: 'New Project',
      description: '',
      status: 'discovery',
    })
    setIsCreating(false)

    if (project) {
      // Navigate to the new project
      router.push(`/projects/${project.id}`)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-teal-500" />
              Projects
            </h1>
            <p className="text-sm text-slate-400">Your path to freedom</p>
          </div>
          <Link
            href="/settings"
            className="p-2 rounded-full hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-5 h-5 text-slate-400" />
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Active Projects - Main Focus */}
        {activeProjects.length > 0 && (
          <section>
            <div className="space-y-3">
              {activeProjects.map((project, index) => (
                <ProjectCard key={project.id} project={project} delay={index * 0.05} />
              ))}
            </div>
          </section>
        )}

        {/* Launched Projects */}
        {launchedProjects.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Rocket className="w-4 h-4" />
              Launched
            </h2>
            <div className="space-y-3">
              {launchedProjects.map((project, index) => (
                <ProjectCard key={project.id} project={project} delay={index * 0.05} />
              ))}
            </div>
          </section>
        )}

        {/* Paused Projects */}
        {pausedProjects.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">
              Paused
            </h2>
            <div className="space-y-3">
              {pausedProjects.map((project, index) => (
                <ProjectCard key={project.id} project={project} delay={index * 0.05} />
              ))}
            </div>
          </section>
        )}

        {/* Add Another Project - subtle, at bottom when projects exist */}
        {displayProjects.length > 0 && (
          <section className="pt-4 border-t border-slate-800">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Add another project</p>
            <div className="flex gap-2">
              <Link href="/path-finder" className="flex-1">
                <button className="w-full px-3 py-2 text-sm text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Compass className="w-4 h-4" />
                  Path Finder
                </button>
              </Link>
              <button
                onClick={handleCreateProject}
                disabled={isCreating}
                className="flex-1 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Blank Project
              </button>
            </div>
          </section>
        )}

        {/* Empty State */}
        {displayProjects.length === 0 && (
          <Card className="text-center py-12">
            <div className="text-4xl mb-4">🚀</div>
            <h3 className="text-lg font-semibold text-white mb-2">No projects yet</h3>
            <p className="text-sm text-slate-400 mb-6">
              Start by discovering what to build or create a blank project.
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
                Create Blank Project
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
