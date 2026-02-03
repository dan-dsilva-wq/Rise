'use client'

import { motion } from 'framer-motion'
import { Settings, Sparkles, Compass, Rocket, Hammer } from 'lucide-react'
import Link from 'next/link'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { DailyPrompt } from '@/components/morning/DailyPrompt'
import { useUser } from '@/lib/hooks/useUser'
import type { Profile, DailyLog, Project } from '@/lib/supabase/types'

interface DashboardContentProps {
  profile: Profile | null
  todayLog: DailyLog | null
  dailyPrompt: { prompt_text: string; author: string | null }
  projects?: Project[]
}

export function DashboardContent({
  profile: initialProfile,
  dailyPrompt,
  projects = [],
}: DashboardContentProps) {
  const { profile } = useUser()

  const currentProfile = profile || initialProfile

  // Determine time of day for greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const displayName = currentProfile?.display_name || 'there'

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-100">
              {greeting}, {displayName}
            </h1>
            <p className="text-sm text-slate-400">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
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
        {/* PROJECTS - The Main Focus */}
        {projects.length > 0 ? (
          <section className="space-y-4">
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link href={`/projects/${project.id}`}>
                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 hover:border-teal-500/50 transition-all duration-300 group shadow-lg hover:shadow-teal-500/10">
                    {/* Status bar */}
                    <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
                      project.status === 'discovery' ? 'from-purple-500 to-purple-400' :
                      project.status === 'planning' ? 'from-blue-500 to-blue-400' :
                      project.status === 'building' ? 'from-amber-500 to-amber-400' :
                      'from-teal-500 to-emerald-400'
                    }`} />

                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h2 className="font-bold text-2xl text-white group-hover:text-teal-400 transition-colors">
                            {project.name}
                          </h2>
                          {project.description && (
                            <p className="text-slate-400 mt-1 line-clamp-2">{project.description}</p>
                          )}
                        </div>
                        <div className="ml-4 p-2 rounded-full bg-slate-700/50 group-hover:bg-teal-500/20 transition-colors">
                          {project.status === 'building' ? (
                            <Hammer className="w-5 h-5 text-amber-400" />
                          ) : project.status === 'discovery' ? (
                            <Compass className="w-5 h-5 text-purple-400" />
                          ) : (
                            <Rocket className="w-5 h-5 text-teal-400" />
                          )}
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-slate-400">Progress</span>
                          <span className="text-white font-bold">{project.progress_percent}%</span>
                        </div>
                        <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${project.progress_percent}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${
                          project.status === 'discovery' ? 'text-purple-400' :
                          project.status === 'planning' ? 'text-blue-400' :
                          project.status === 'building' ? 'text-amber-400' :
                          'text-teal-400'
                        }`}>
                          {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                        </span>
                        <span className="text-sm text-slate-500 group-hover:text-teal-400 transition-colors">
                          Tap to continue →
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}

            {/* Add another project link */}
            <Link href="/path-finder">
              <div className="flex items-center justify-center gap-2 py-4 text-slate-500 hover:text-teal-400 transition-colors">
                <Compass className="w-4 h-4" />
                <span className="text-sm">Start another project</span>
              </div>
            </Link>
          </section>
        ) : (
          /* No projects - Big Path Finder CTA */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link href="/path-finder">
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-900/40 via-slate-800 to-teal-900/40 border border-purple-500/30 hover:border-teal-500/50 transition-all duration-300 group shadow-xl p-8 text-center">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div className="relative">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500/20 to-teal-500/20 flex items-center justify-center">
                    <Compass className="w-10 h-10 text-purple-400 group-hover:text-teal-400 transition-colors" />
                  </div>

                  <h2 className="text-2xl font-bold text-white mb-3">Find Your Path</h2>
                  <p className="text-slate-400 mb-6 max-w-xs mx-auto">
                    Discover what to build. Have a conversation with AI to find your next project.
                  </p>

                  <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-purple-500 to-teal-500 text-white font-semibold group-hover:shadow-lg group-hover:shadow-teal-500/25 transition-all">
                    <Sparkles className="w-5 h-5" />
                    Start Path Finder
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        {/* Daily Prompt */}
        <DailyPrompt
          prompt={dailyPrompt.prompt_text}
          author={dailyPrompt.author}
        />
      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0">
        <BottomNavigation />
      </div>
    </div>
  )
}
