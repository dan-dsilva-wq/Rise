'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Compass, Rocket, RefreshCw, ChevronRight, AlertCircle, Circle, Target } from 'lucide-react'
import Link from 'next/link'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { useUser } from '@/lib/hooks/useUser'
import type { Profile, DailyLog, Project, MorningBriefing } from '@/lib/supabase/types'

interface CurrentStepInfo {
  stepId: string
  stepText: string
  stepNumber: number
  totalSteps: number
  completedSteps: number
}

interface DashboardContentProps {
  profile: Profile | null
  todayLog: DailyLog | null
  dailyPrompt: { prompt_text: string; author: string | null }
  projects?: Project[]
}

export function DashboardContent({
  profile: initialProfile,
  projects = [],
}: DashboardContentProps) {
  const { profile } = useUser()
  const [briefing, setBriefing] = useState<MorningBriefing | null>(null)
  const [currentStep, setCurrentStep] = useState<CurrentStepInfo | null>(null)
  const [loadingBriefing, setLoadingBriefing] = useState(true)
  const [briefingError, setBriefingError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [regenerateError, setRegenerateError] = useState(false)

  const currentProfile = profile || initialProfile

  // Fetch morning briefing (API auto-checks if focus milestone is still valid)
  useEffect(() => {
    fetchBriefing()
  }, [])

  const fetchBriefing = async () => {
    setLoadingBriefing(true)
    setBriefingError(null)
    try {
      const response = await fetch('/api/morning-briefing')
      if (response.ok) {
        const data = await response.json()
        setBriefing(data.briefing)
        setCurrentStep(data.currentStep || null)
      } else {
        setBriefingError('Unable to load your morning briefing')
      }
    } catch (error) {
      console.error('Failed to fetch briefing:', error)
      setBriefingError('Connection error. Please check your network.')
    } finally {
      setLoadingBriefing(false)
    }
  }

  const regenerateBriefing = async () => {
    setRegenerating(true)
    setRegenerateError(false)
    try {
      const response = await fetch('/api/morning-briefing', { method: 'POST' })
      if (response.ok) {
        const data = await response.json()
        setBriefing(data.briefing)
        setCurrentStep(data.currentStep || null)
        setBriefingError(null)
      } else {
        setRegenerateError(true)
        // Auto-clear error after 3 seconds
        setTimeout(() => setRegenerateError(false), 3000)
      }
    } catch (error) {
      console.error('Failed to regenerate briefing:', error)
      setRegenerateError(true)
      setTimeout(() => setRegenerateError(false), 3000)
    } finally {
      setRegenerating(false)
    }
  }

  // Determine time of day for greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const displayName = currentProfile?.display_name || 'there'

  // Find the focus project for the "Let's Work" button
  const focusProject = briefing?.focus_project_id
    ? projects.find(p => p.id === briefing.focus_project_id)
    : projects[0]

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header - Minimal */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-4">
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
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* MORNING BRIEFING - Only show when user has projects */}
        {projects.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 border border-slate-700/50 shadow-xl"
        >
          {/* Subtle gradient accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-teal-500 to-emerald-500" />

          <div className="p-6">
            {loadingBriefing ? (
              /* Skeleton loading state with shimmer effect */
              <div>
                {/* Mission Summary Skeleton */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded skeleton-shimmer" />
                    <div className="h-4 w-28 rounded skeleton-shimmer skeleton-shimmer-delay-1" />
                  </div>
                  <div className="h-7 w-3/4 rounded skeleton-shimmer skeleton-shimmer-delay-1 mb-2" />
                  <div className="h-4 w-full rounded skeleton-shimmer skeleton-shimmer-delay-2" />
                  <div className="h-4 w-2/3 rounded skeleton-shimmer skeleton-shimmer-delay-3 mt-2" />
                </div>

                {/* AI Nudge Skeleton */}
                <div className="mb-6 p-4 rounded-2xl bg-slate-700/30 border border-slate-600/30">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-slate-700/50 flex-shrink-0">
                      <div className="w-4 h-4 rounded skeleton-shimmer" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-full rounded skeleton-shimmer skeleton-shimmer-delay-1" />
                      <div className="h-4 w-4/5 rounded skeleton-shimmer skeleton-shimmer-delay-2" />
                    </div>
                  </div>
                </div>

                {/* Action Buttons Skeleton */}
                <div className="flex gap-3">
                  <div className="flex-1 h-14 rounded-2xl skeleton-shimmer skeleton-shimmer-delay-2" />
                  <div className="w-14 h-14 rounded-2xl skeleton-shimmer skeleton-shimmer-delay-3" />
                </div>
              </div>
            ) : briefingError ? (
              /* Error state with retry */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 mb-4">
                  <AlertCircle className="w-7 h-7 text-red-400" />
                </div>
                <p className="text-slate-300 font-medium mb-1">Something went wrong</p>
                <p className="text-slate-500 text-sm mb-4">{briefingError}</p>
                <button
                  onClick={fetchBriefing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try again
                </button>
              </motion.div>
            ) : briefing ? (
              <>
                {/* Mission Summary */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Rocket className="w-5 h-5 text-teal-400" />
                    <span className="text-sm font-medium text-teal-400 uppercase tracking-wide">Today&apos;s Mission</span>
                  </div>
                  {(() => {
                    const [headline, detail] = briefing.mission_summary.split('|||')
                    return (
                      <>
                        <h2 className="text-2xl font-bold text-white leading-tight">
                          {headline}
                        </h2>
                        {detail && (
                          <p className="text-slate-400 mt-2">{detail}</p>
                        )}
                      </>
                    )
                  })()}
                </div>

                {/* Current Step - THE KEY "PULL" FACTOR */}
                {currentStep && briefing.focus_milestone_id && (
                  <Link href={`/projects/${briefing.focus_project_id}/milestone/${briefing.focus_milestone_id}`}>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-2 border-orange-500/30 hover:border-orange-400/50 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-orange-400" />
                        <span className="text-xs font-bold text-orange-400 uppercase tracking-wide">Your Next Step</span>
                        <span className="ml-auto text-xs text-slate-500">
                          {currentStep.stepNumber}/{currentStep.totalSteps}
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex-shrink-0">
                          <div className="w-5 h-5 rounded-full border-2 border-orange-400 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium group-hover:text-orange-200 transition-colors">
                            {currentStep.stepText}
                          </p>
                          {currentStep.completedSteps > 0 && (
                            <p className="text-xs text-slate-500 mt-1">
                              {currentStep.completedSteps} step{currentStep.completedSteps !== 1 ? 's' : ''} completed
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-orange-400/50 group-hover:text-orange-400 group-hover:translate-x-1 transition-all flex-shrink-0" />
                      </div>
                      {/* Progress bar */}
                      <div className="mt-3 h-1 bg-slate-700/50 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(currentStep.completedSteps / currentStep.totalSteps) * 100}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="h-full bg-orange-400"
                        />
                      </div>
                    </motion.div>
                  </Link>
                )}

                {/* AI Nudge - Only show if no current step, to keep focus */}
                {!currentStep && (
                  <div className="mb-6 p-4 rounded-2xl bg-slate-700/30 border border-slate-600/30">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-purple-500/20 flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                      </div>
                      <p className="text-slate-300 italic leading-relaxed">
                        &ldquo;{briefing.nudge}&rdquo;
                      </p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  {focusProject ? (
                    <Link href={`/projects/${focusProject.id}`} className="flex-1">
                      <button className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold text-lg hover:shadow-lg hover:shadow-teal-500/25 transition-all flex items-center justify-center gap-2">
                        Let&apos;s Work
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </Link>
                  ) : (
                    <Link href="/path-finder" className="flex-1">
                      <button className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-purple-500 to-teal-500 text-white font-bold text-lg hover:shadow-lg hover:shadow-purple-500/25 transition-all flex items-center justify-center gap-2">
                        Find Your Path
                        <Compass className="w-5 h-5" />
                      </button>
                    </Link>
                  )}

                  <button
                    onClick={regenerateBriefing}
                    disabled={regenerating}
                    className={`p-4 rounded-2xl transition-colors disabled:opacity-50 ${
                      regenerateError
                        ? 'bg-red-500/20 border border-red-500/30'
                        : 'bg-slate-700/50 hover:bg-slate-700'
                    }`}
                    title={regenerateError ? 'Failed to regenerate - tap to retry' : 'Regenerate briefing'}
                  >
                    {regenerateError ? (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <RefreshCw className={`w-5 h-5 text-slate-400 ${regenerating ? 'animate-spin' : ''}`} />
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* No briefing - shouldn't happen but fallback */
              <div className="text-center py-4">
                <p className="text-slate-400">Couldn&apos;t load your briefing</p>
                <button
                  onClick={fetchBriefing}
                  className="mt-2 text-teal-400 hover:text-teal-300"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </motion.div>
        )}

        {/* Projects List - Secondary */}
        {projects.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide">Your Projects</h3>
              <Link href="/projects" className="text-sm text-teal-400 hover:text-teal-300">
                View all
              </Link>
            </div>

            <div className="space-y-2">
              {projects.slice(0, 3).map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-700/30 hover:border-teal-500/30 transition-colors flex items-center justify-between group">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white truncate group-hover:text-teal-400 transition-colors">
                        {project.name}
                      </h4>
                      <p className="text-sm text-slate-500">{project.status} • {project.progress_percent}%</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-teal-400 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>

            {/* Path Finder link */}
            <Link href="/path-finder">
              <div className="mt-3 p-4 rounded-2xl border border-dashed border-slate-700 hover:border-purple-500/50 transition-colors flex items-center justify-center gap-2 text-slate-500 hover:text-purple-400">
                <Compass className="w-4 h-4" />
                <span className="text-sm">Start new project</span>
              </div>
            </Link>
          </motion.div>
        )}

        {/* NEW USER ONBOARDING - Full Experience */}
        {projects.length === 0 && !loadingBriefing && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-6"
          >
            {/* Hero Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-900/40 via-slate-800 to-teal-900/40 border border-purple-500/20 shadow-2xl">
              {/* Animated gradient border */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-500 via-teal-500 to-emerald-500" />

              <div className="p-8 text-center">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/20 to-teal-500/20 border border-purple-500/30 mb-6"
                >
                  <Rocket className="w-10 h-10 text-teal-400" />
                </motion.div>

                {/* Welcome Text */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <h2 className="text-3xl font-bold text-white mb-3">
                    Welcome to Rise
                  </h2>
                  <p className="text-lg text-slate-300 mb-2">
                    Your AI cofounder for building toward freedom.
                  </p>
                  <p className="text-slate-400 max-w-sm mx-auto">
                    Rise helps you discover what to build, break it into steps, and make progress every day.
                  </p>
                </motion.div>

                {/* Big CTA Button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mt-8"
                >
                  <Link href="/path-finder">
                    <button className="group relative w-full max-w-xs py-5 px-8 rounded-2xl bg-gradient-to-r from-purple-500 via-teal-500 to-emerald-500 text-white font-bold text-xl shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-teal-500/30 transition-all hover:scale-[1.02]">
                      <span className="flex items-center justify-center gap-3">
                        Start Here
                        <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </button>
                  </Link>
                </motion.div>
              </div>
            </div>

            {/* How It Works - 3 Steps */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="space-y-3"
            >
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide text-center mb-4">
                How It Works
              </h3>

              {/* Step 1 */}
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-800/30 border border-slate-700/30">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <span className="text-purple-400 font-bold">1</span>
                </div>
                <div>
                  <h4 className="font-semibold text-white">Discover Your Path</h4>
                  <p className="text-sm text-slate-400">Chat with AI to explore what you could build based on your skills and goals.</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-800/30 border border-slate-700/30">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center">
                  <span className="text-teal-400 font-bold">2</span>
                </div>
                <div>
                  <h4 className="font-semibold text-white">Build With AI</h4>
                  <p className="text-sm text-slate-400">Your project gets broken into milestones. AI helps you complete each one.</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-800/30 border border-slate-700/30">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">3</span>
                </div>
                <div>
                  <h4 className="font-semibold text-white">Launch & Grow</h4>
                  <p className="text-sm text-slate-400">Ship your project and start earning. Rise tracks your progress toward freedom.</p>
                </div>
              </div>
            </motion.div>

            {/* Secondary CTA */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-center pt-4"
            >
              <Link href="/path-finder">
                <button className="inline-flex items-center gap-2 text-teal-400 hover:text-teal-300 font-medium">
                  <Compass className="w-5 h-5" />
                  Let&apos;s discover what you should build
                  <ChevronRight className="w-4 h-4" />
                </button>
              </Link>
            </motion.div>
          </motion.div>
        )}
      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0">
        <BottomNavigation />
      </div>
    </div>
  )
}
