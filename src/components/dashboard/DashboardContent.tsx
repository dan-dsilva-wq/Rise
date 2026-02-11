'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Compass, Moon, Sparkles, Target } from 'lucide-react'
import Link from 'next/link'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { MorningCheckIn } from '@/components/morning/MorningCheckIn'
import { NotificationBanner } from '@/components/notifications/NotificationBanner'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/lib/hooks/useUser'
import { createClient } from '@/lib/supabase/client'
import { rebalanceMilestoneFocusPipeline } from '@/lib/milestones/focusPipeline'
import { getHourForTimezone } from '@/lib/time/logDate'
import type { DailyLog, Milestone, MilestoneStep, Profile, Project } from '@/lib/supabase/types'

const ACTIONABLE_STATUSES: Milestone['status'][] = ['pending', 'in_progress']

const FOCUS_PRIORITY: Record<Milestone['focus_level'], number> = {
  active: 0,
  next: 1,
  backlog: 2,
}

interface DashboardContentProps {
  profile: Profile | null
  todayLog: DailyLog | null
  dailyPrompt: { prompt_text: string; author: string | null }
  projects?: Project[]
}

interface FocusItem {
  milestone: Milestone
  project: Pick<Project, 'id' | 'name' | 'status'>
  nextStep: string | null
}

interface QueueRow {
  id: string
  project_id: string
  focus_level: Milestone['focus_level']
  sort_order: number
}

interface FeedbackState {
  tone: 'success' | 'gentle'
  message: string
}

function shouldShowEveningNudge(todayLog: DailyLog | null, timezone: string | null | undefined): boolean {
  const hour = timezone ? getHourForTimezone(timezone) : new Date().getHours()
  const inEveningWindow = hour >= 17 || hour < 4
  if (!inEveningWindow) return false
  if (!todayLog) return false
  if (todayLog.evening_mood || todayLog.evening_energy) return false
  return true
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function compareFocusQueue(a: Milestone, b: Milestone, projectOrderMap: Map<string, number>) {
  const priorityDiff = FOCUS_PRIORITY[a.focus_level] - FOCUS_PRIORITY[b.focus_level]
  if (priorityDiff !== 0) return priorityDiff

  const projectOrderA = projectOrderMap.get(a.project_id) ?? Number.MAX_SAFE_INTEGER
  const projectOrderB = projectOrderMap.get(b.project_id) ?? Number.MAX_SAFE_INTEGER
  if (projectOrderA !== projectOrderB) return projectOrderA - projectOrderB

  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order

  return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
}

export function DashboardContent({
  profile: initialProfile,
  todayLog = null,
  dailyPrompt,
  projects = [],
}: DashboardContentProps) {
  const supabase = useMemo(() => createClient(), [])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any
  const { user, profile } = useUser()
  const currentProfile = profile || initialProfile

  const [checkedIn, setCheckedIn] = useState(false)
  const [queueLoading, setQueueLoading] = useState(true)
  const [focusItem, setFocusItem] = useState<FocusItem | null>(null)
  const [actionState, setActionState] = useState<'done' | 'skip' | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const needsMorningCheckIn = !checkedIn && (!todayLog || todayLog.morning_mood == null)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const displayName = currentProfile?.display_name || 'there'

  const initialProjectMap = useMemo(() => {
    const map = new Map<string, Pick<Project, 'id' | 'name' | 'status'>>()
    for (const project of projects) {
      map.set(project.id, { id: project.id, name: project.name, status: project.status })
    }
    return map
  }, [projects])

  const projectOrderMap = useMemo(() => {
    const map = new Map<string, number>()
    projects.forEach((project, index) => {
      map.set(project.id, index)
    })
    return map
  }, [projects])

  const fetchFocusItem = useCallback(async () => {
    if (!client || !user?.id) {
      setQueueLoading(false)
      setFocusItem(null)
      return
    }

    setQueueLoading(true)
    setErrorMessage(null)

    try {
      const { data: milestoneRows, error: milestoneError } = await client
        .from('milestones')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ACTIONABLE_STATUSES)

      if (milestoneError) {
        throw milestoneError
      }

      const actionableMilestones = ((milestoneRows || []) as Milestone[])
        .filter(milestone => milestone.status !== 'completed' && milestone.status !== 'discarded' && milestone.status !== 'idea')
        .sort((a, b) => compareFocusQueue(a, b, projectOrderMap))

      if (actionableMilestones.length === 0) {
        setFocusItem(null)
        return
      }

      const projectMap = new Map(initialProjectMap)
      const missingProjectIds = Array.from(
        new Set(
          actionableMilestones
            .map(milestone => milestone.project_id)
            .filter(projectId => !projectMap.has(projectId))
        )
      )

      if (missingProjectIds.length > 0) {
        const { data: missingProjects, error: projectError } = await client
          .from('projects')
          .select('id, name, status')
          .eq('user_id', user.id)
          .in('id', missingProjectIds)

        if (projectError) {
          throw projectError
        }

        for (const project of (missingProjects || []) as Pick<Project, 'id' | 'name' | 'status'>[]) {
          projectMap.set(project.id, project)
        }
      }

      const milestoneIds = actionableMilestones.map(milestone => milestone.id)
      const stepsByMilestone = new Map<string, MilestoneStep[]>()

      if (milestoneIds.length > 0) {
        const { data: stepRows, error: stepsError } = await client
          .from('milestone_steps')
          .select('*')
          .eq('user_id', user.id)
          .in('milestone_id', milestoneIds)
          .order('sort_order', { ascending: true })

        if (stepsError) {
          throw stepsError
        }

        for (const step of (stepRows || []) as MilestoneStep[]) {
          const existing = stepsByMilestone.get(step.milestone_id) || []
          existing.push(step)
          stepsByMilestone.set(step.milestone_id, existing)
        }
      }

      const selectedMilestone = actionableMilestones[0]
      const steps = stepsByMilestone.get(selectedMilestone.id) || []
      const nextStep = steps.find(step => !step.is_completed)?.text || null
      const project = projectMap.get(selectedMilestone.project_id)

      setFocusItem({
        milestone: selectedMilestone,
        project: project || {
          id: selectedMilestone.project_id,
          name: 'Project',
          status: 'building',
        },
        nextStep,
      })
    } catch (error) {
      console.error('Failed to load focus queue:', error)
      setErrorMessage('Could not load your focus queue right now.')
      setFocusItem(null)
    } finally {
      setQueueLoading(false)
    }
  }, [client, initialProjectMap, projectOrderMap, user?.id])

  useEffect(() => {
    fetchFocusItem()
  }, [fetchFocusItem])

  const handleDone = useCallback(async () => {
    if (!focusItem || !client || actionState) return

    setActionState('done')
    setErrorMessage(null)

    try {
      const now = new Date().toISOString()
      const { error } = await client
        .from('milestones')
        .update({
          status: 'completed',
          completed_at: now,
          updated_at: now,
        })
        .eq('id', focusItem.milestone.id)

      if (error) {
        throw error
      }

      await rebalanceMilestoneFocusPipeline(client, focusItem.milestone.project_id)

      setFocusItem(null)
      setFeedback({
        tone: 'success',
        message: 'Nice work. Locking that in.',
      })

      await wait(900)
      await fetchFocusItem()
      setFeedback(null)
    } catch (error) {
      console.error('Failed to complete milestone from focus card:', error)
      setErrorMessage('Could not mark this as done. Please try again.')
      await fetchFocusItem()
    } finally {
      setActionState(null)
    }
  }, [actionState, client, fetchFocusItem, focusItem])

  const handleNotNow = useCallback(async () => {
    if (!focusItem || !client || actionState) return
    if (!user?.id) return

    setActionState('skip')
    setErrorMessage(null)

    try {
      const { count: globalAlternativeCount, error: alternativeError } = await client
        .from('milestones')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ACTIONABLE_STATUSES)
        .neq('id', focusItem.milestone.id)

      if (alternativeError) {
        throw alternativeError
      }

      const hasGlobalAlternative = (globalAlternativeCount || 0) > 0
      if (!hasGlobalAlternative) {
        setFeedback({
          tone: 'gentle',
          message: 'No other queued item yet. Add one when you are ready.',
        })
        await wait(900)
        setFeedback(null)
        return
      }

      const { data: queueRows, error: queueError } = await client
        .from('milestones')
        .select('id, project_id, focus_level, sort_order')
        .eq('user_id', user.id)
        .eq('project_id', focusItem.milestone.project_id)
        .in('status', ACTIONABLE_STATUSES)
        .order('sort_order', { ascending: true })

      if (queueError) {
        throw queueError
      }

      const projectQueue = (queueRows || []) as QueueRow[]
      const alternatives = projectQueue.filter(row => row.id !== focusItem.milestone.id)

      const maxSortOrder = Math.max(
        ...projectQueue.map(row => row.sort_order),
        focusItem.milestone.sort_order
      )

      const now = new Date().toISOString()
      const { error: updateError } = await client
        .from('milestones')
        .update({
          focus_level: 'next',
          sort_order: maxSortOrder + 1,
          updated_at: now,
        })
        .eq('id', focusItem.milestone.id)

      if (updateError) {
        throw updateError
      }

      // Only rebalance if this project has other actionable items. Otherwise, keep this item out of active
      // so another project's focus can surface.
      if (alternatives.length > 0) {
        await rebalanceMilestoneFocusPipeline(client, focusItem.milestone.project_id)
      }

      setFocusItem(null)
      setFeedback({
        tone: 'gentle',
        message: 'All good. Parked for later.',
      })

      await wait(700)
      await fetchFocusItem()
      setFeedback(null)
    } catch (error) {
      console.error('Failed to skip focus milestone:', error)
      setErrorMessage('Could not move this for later. Please try again.')
      await fetchFocusItem()
    } finally {
      setActionState(null)
    }
  }, [actionState, client, fetchFocusItem, focusItem, user?.id])

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-xl mx-auto px-5 py-4">
          <h1 className="text-2xl font-semibold text-slate-100">
            {greeting}, {displayName}
          </h1>
          <p className="text-sm text-slate-400">
            One thing at a time.
          </p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-5 py-8">
        {needsMorningCheckIn && (
          <div className="mb-8">
            <MorningCheckIn
              displayName={currentProfile?.display_name || null}
              onComplete={() => setCheckedIn(true)}
            />
          </div>
        )}

        <NotificationBanner />

        <section className="min-h-[56vh] flex flex-col justify-center">
          <div className="text-center mb-6">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
              Focus queue
            </p>
          </div>

          <AnimatePresence mode="wait">
            {queueLoading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-3xl border border-slate-800 bg-slate-800/40 p-8 text-center"
              >
                <div className="w-10 h-10 rounded-full border-2 border-teal-500/30 border-t-teal-400 mx-auto animate-spin mb-5" />
                <p className="text-slate-300">Finding your next focus...</p>
              </motion.div>
            )}

            {!queueLoading && feedback && (
              <motion.div
                key="feedback"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                className={`rounded-3xl border p-8 text-center ${
                  feedback.tone === 'success'
                    ? 'border-teal-500/30 bg-teal-500/10'
                    : 'border-slate-700 bg-slate-800/60'
                }`}
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-900/60 mb-4">
                  {feedback.tone === 'success' ? (
                    <CheckCircle2 className="w-6 h-6 text-teal-300" />
                  ) : (
                    <Sparkles className="w-6 h-6 text-slate-300" />
                  )}
                </div>
                <p className="text-lg text-slate-100">{feedback.message}</p>
              </motion.div>
            )}

            {!queueLoading && !feedback && focusItem && (
              <motion.article
                key={focusItem.milestone.id}
                initial={{ opacity: 0, y: 14, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.99 }}
                transition={{ duration: 0.22 }}
                className="rounded-3xl border border-slate-700/70 bg-slate-800/70 p-8 shadow-2xl shadow-slate-950/40"
              >
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Target className="w-4 h-4 text-teal-300" />
                  <span>{focusItem.project.name}</span>
                </div>

                <p className="mt-6 text-3xl leading-tight font-semibold text-slate-100">
                  {focusItem.nextStep || focusItem.milestone.title}
                </p>

                {focusItem.nextStep && (
                  <p className="mt-3 text-sm text-slate-500">
                    Milestone: {focusItem.milestone.title}
                  </p>
                )}

                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    variant="primary"
                    size="lg"
                    isLoading={actionState === 'done'}
                    loadingText="Marking done..."
                    onClick={handleDone}
                    className="w-full"
                  >
                    Done
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    isLoading={actionState === 'skip'}
                    loadingText="Moving for later..."
                    onClick={handleNotNow}
                    className="w-full"
                  >
                    Not now
                  </Button>
                </div>

                <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <Link
                    href={`/projects/${focusItem.project.id}/milestone/${focusItem.milestone.id}`}
                    className="inline-flex items-center text-sm text-teal-300 hover:text-teal-200 transition-colors"
                  >
                    Open Milestone Mode
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                  <Link
                    href="/path-finder"
                    className="inline-flex items-center text-sm text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Need to rethink?
                    <Compass className="w-4 h-4 ml-1" />
                  </Link>
                </div>
              </motion.article>
            )}

            {!queueLoading && !feedback && !focusItem && (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-3xl border border-slate-800 bg-slate-800/40 p-8 text-center"
              >
                <p className="text-xl text-slate-100">Nothing queued right now.</p>
                <p className="text-slate-400 mt-3">
                  {dailyPrompt.prompt_text}
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/path-finder">
                    <Button variant="primary" size="md" className="w-full sm:w-auto">
                      <Compass className="w-4 h-4 mr-2" />
                      Ask Path Finder
                    </Button>
                  </Link>
                  <Link href="/projects">
                    <Button variant="ghost" size="md" className="w-full sm:w-auto">
                      View Projects
                    </Button>
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {errorMessage && (
            <p className="mt-4 text-center text-sm text-red-300">{errorMessage}</p>
          )}
        </section>

        {shouldShowEveningNudge(todayLog, currentProfile?.timezone) && (
          <div className="mt-4 text-center">
            <Link
              href="/evening"
              className="inline-flex items-center text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Moon className="w-4 h-4 mr-2" />
              Evening reflection is ready when you are
            </Link>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0">
        <BottomNavigation />
      </div>
    </div>
  )
}
