'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Compass,
  Rocket,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  Target,
  Eye,
  X,
  Moon,
  Heart,
  Flame,
  Sunrise,
} from 'lucide-react'
import Link from 'next/link'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { MorningCheckIn } from '@/components/morning/MorningCheckIn'
import { useUser } from '@/lib/hooks/useUser'
import type { Profile, DailyLog, Project, MorningBriefing } from '@/lib/supabase/types'

function shouldShowEveningNudge(todayLog: DailyLog | null): boolean {
  const hour = new Date().getHours()
  if (hour < 18) return false
  if (!todayLog) return false
  if (todayLog.evening_mood || todayLog.evening_energy) return false
  return true
}

interface CurrentStepInfo {
  stepId: string
  stepText: string
  stepNumber: number
  totalSteps: number
  completedSteps: number
}

interface RiseInsight {
  text: string
  type: 'pattern' | 'connection' | 'shift' | 'question'
  warmth: 'encouraging' | 'curious' | 'gentle' | 'celebratory'
}

interface DashboardContentProps {
  profile: Profile | null
  todayLog: DailyLog | null
  dailyPrompt: { prompt_text: string; author: string | null }
  projects?: Project[]
}

function parseMissionSummary(summary: string | null | undefined) {
  if (!summary) return { headline: 'Find your next move', detail: '' }
  const [headline, detail] = summary.split('|||')
  return {
    headline: headline?.trim() || 'Find your next move',
    detail: detail?.trim() || '',
  }
}

function createStarterHref(starter: string, autoSend = false) {
  const query = `starter=${encodeURIComponent(starter)}`
  return `/path-finder?${query}${autoSend ? '&autosend=1' : ''}`
}

export function DashboardContent({
  profile: initialProfile,
  todayLog = null,
  dailyPrompt,
  projects = [],
}: DashboardContentProps) {
  const { profile } = useUser()
  const [briefing, setBriefing] = useState<MorningBriefing | null>(null)
  const [currentStep, setCurrentStep] = useState<CurrentStepInfo | null>(null)
  const [personalGreeting, setPersonalGreeting] = useState<string | null>(null)
  const [loadingBriefing, setLoadingBriefing] = useState(true)
  const [briefingError, setBriefingError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [regenerateError, setRegenerateError] = useState(false)
  const [riseInsights, setRiseInsights] = useState<RiseInsight[]>([])
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [dismissedInsights, setDismissedInsights] = useState<Set<number>>(new Set())
  const [momentum, setMomentum] = useState<{ milestonesThisWeek: number; loginStreak: number; daysSinceLastVisit: number } | null>(null)
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkInData, setCheckInData] = useState<{ mood: number; energy: number } | null>(null)

  const currentProfile = profile || initialProfile
  const needsMorningCheckIn = !checkedIn && (!todayLog || todayLog.morning_mood == null)
  const visibleInsights = riseInsights.filter((_, i) => !dismissedInsights.has(i))

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const displayName = currentProfile?.display_name || 'friend'

  const focusProject = briefing?.focus_project_id
    ? projects.find(p => p.id === briefing.focus_project_id)
    : projects[0]

  const mission = parseMissionSummary(briefing?.mission_summary)

  const primaryLink = useMemo(() => {
    if (!focusProject) {
      return createStarterHref('I feel stuck this morning. Help me find one clear direction.')
    }
    if (briefing?.focus_milestone_id) {
      return `/projects/${focusProject.id}/milestone/${briefing.focus_milestone_id}`
    }
    return `/projects/${focusProject.id}`
  }, [briefing?.focus_milestone_id, focusProject])

  useEffect(() => {
    void fetchBriefing()
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
        if (data.personalGreeting) setPersonalGreeting(data.personalGreeting)
        if (data.momentum) setMomentum(data.momentum)
      } else {
        setBriefingError('Unable to load your mission right now')
      }
    } catch (error) {
      console.error('Failed to fetch briefing:', error)
      setBriefingError('Connection issue while loading your mission')
    } finally {
      setLoadingBriefing(false)
    }
  }

  const regenerateBriefing = async () => {
    setRegenerating(true)
    setRegenerateError(false)
    try {
      const response = await fetch('/api/morning-briefing', { method: 'POST' })
      if (!response.ok) {
        setRegenerateError(true)
        setTimeout(() => setRegenerateError(false), 3000)
        return
      }
      const data = await response.json()
      setBriefing(data.briefing)
      setCurrentStep(data.currentStep || null)
      if (data.personalGreeting) setPersonalGreeting(data.personalGreeting)
      if (data.momentum) setMomentum(data.momentum)
      setBriefingError(null)
    } catch (error) {
      console.error('Failed to regenerate briefing:', error)
      setRegenerateError(true)
      setTimeout(() => setRegenerateError(false), 3000)
    } finally {
      setRegenerating(false)
    }
  }

  useEffect(() => {
    if (projects.length === 0) return
    if (insightsLoading || riseInsights.length > 0) return

    const fetchInsights = async () => {
      setInsightsLoading(true)
      try {
        const response = await fetch('/api/rise-insights')
        if (!response.ok) return
        const data = await response.json()
        if (data.insights && data.insights.length > 0) {
          setRiseInsights(data.insights)
        }
      } catch (error) {
        console.error('Failed to fetch insights:', error)
      } finally {
        setInsightsLoading(false)
      }
    }

    const timer = setTimeout(fetchInsights, 900)
    return () => clearTimeout(timer)
  }, [projects.length, insightsLoading, riseInsights.length])

  const dismissInsight = (index: number) => {
    setDismissedInsights(prev => new Set(prev).add(index))
  }

  const warmUpLink = createStarterHref('I have low energy today. Help me pick one tiny win I can do in 20 minutes.')
  const momentumLink = createStarterHref('I feel focused today. Help me choose the highest-impact move for this session.')

  const quickPaths = [
    {
      title: 'I feel stuck',
      subtitle: 'Get direction in one conversation',
      href: createStarterHref('I feel stuck and overwhelmed. Help me choose one realistic path this week.'),
      icon: Compass,
      tone: 'from-orange-100 to-amber-50 border-orange-200',
    },
    {
      title: 'I need quick money',
      subtitle: 'Explore practical low-risk options',
      href: createStarterHref('I need a low-risk way to make my first $1,000 online. What should I build?'),
      icon: Flame,
      tone: 'from-teal-100 to-emerald-50 border-teal-200',
    },
    {
      title: 'I have too many ideas',
      subtitle: 'Narrow to one path and first step',
      href: createStarterHref('I have too many ideas. Help me pick one and define the first milestone.'),
      icon: Target,
      tone: 'from-sky-100 to-cyan-50 border-sky-200',
    },
  ]

  return (
    <div className="min-h-screen pb-28 bg-[radial-gradient(circle_at_0%_0%,rgba(255,175,120,0.30),transparent_44%),radial-gradient(circle_at_100%_8%,rgba(86,205,168,0.20),transparent_45%),linear-gradient(180deg,#fff7ea_0%,#f7f2e8_44%,#efe8dc_100%)] text-[#1e2a2e]">
      <header className="sticky top-0 z-40 border-b border-[#dbcdb8] bg-[#fff7ea]/90 backdrop-blur-lg">
        <div className="max-w-3xl mx-auto px-4 py-4 md:py-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#7d6f58] mb-1">Rise</p>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl md:text-3xl leading-tight text-[#2a2f2f]">
                {greeting}, {displayName}
              </h1>
              <p className="text-sm text-[#6f746f]">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            {momentum?.loginStreak && momentum.loginStreak >= 2 && (
              <div className="rounded-full border border-[#d8c9b0] bg-white/70 px-3 py-1 text-xs text-[#576969]">
                Day {momentum.loginStreak}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 md:py-7 space-y-5">
        {needsMorningCheckIn && (
          <MorningCheckIn
            displayName={currentProfile?.display_name || null}
            onComplete={(data) => {
              setCheckedIn(true)
              setCheckInData(data)
            }}
          />
        )}

        <AnimatePresence>
          {checkedIn && checkInData && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`rounded-2xl border p-4 ${
                checkInData.mood <= 4 || checkInData.energy <= 4
                  ? 'border-blue-200 bg-blue-50/80'
                  : 'border-emerald-200 bg-emerald-50/80'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-full p-2 bg-white/70">
                  {checkInData.mood <= 4 || checkInData.energy <= 4 ? (
                    <Heart className="w-4 h-4 text-blue-700" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-emerald-700" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-[#2f3d40]">
                    {checkInData.mood <= 4 || checkInData.energy <= 4
                      ? 'You do not need a perfect day. Pick one tiny win and let Rise carry the structure.'
                      : 'Good energy today. This is a strong window to move one high-impact step forward.'}
                  </p>
                  <Link
                    href={checkInData.mood <= 4 || checkInData.energy <= 4 ? warmUpLink : momentumLink}
                    className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-[#0f766e] hover:text-[#0b5f59]"
                  >
                    Open guided chat
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <section className="dawn-card rounded-3xl p-5 md:p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 via-amber-400 to-teal-500" />

          {loadingBriefing ? (
            <div className="space-y-3 py-2">
              <div className="h-4 w-36 rounded skeleton-shimmer" />
              <div className="h-8 w-3/4 rounded skeleton-shimmer skeleton-shimmer-delay-1" />
              <div className="h-4 w-full rounded skeleton-shimmer skeleton-shimmer-delay-2" />
              <div className="h-4 w-2/3 rounded skeleton-shimmer skeleton-shimmer-delay-3" />
            </div>
          ) : briefingError ? (
            <div className="text-center py-5">
              <div className="inline-flex w-12 h-12 rounded-full items-center justify-center bg-red-50 border border-red-200 mb-3">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <p className="text-sm text-[#384343]">{briefingError}</p>
              <button
                onClick={fetchBriefing}
                className="mt-3 px-4 py-2 rounded-xl border border-[#d7cab5] bg-white hover:bg-[#faf4ea] text-sm text-[#334244]"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#7c705b]">Today&apos;s Mission</p>
                <button
                  onClick={regenerateBriefing}
                  disabled={regenerating}
                  className={`p-2 rounded-xl border transition-colors ${
                    regenerateError
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-[#d8cab4] bg-white/80 text-[#5f6764] hover:text-[#2f3e40] hover:bg-white'
                  }`}
                  title={regenerateError ? 'Failed to regenerate - tap to retry' : 'Regenerate mission'}
                >
                  <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <h2 className="font-display text-3xl leading-tight text-[#232f31]">{mission.headline}</h2>
              {mission.detail && (
                <p className="text-sm md:text-base text-[#5e6865] mt-2">{mission.detail}</p>
              )}

              {currentStep && (
                <Link href={`/projects/${briefing?.focus_project_id}/milestone/${briefing?.focus_milestone_id}`}>
                  <div className="mt-4 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4 hover:border-orange-300 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-orange-700" />
                      <p className="text-xs uppercase tracking-[0.12em] text-orange-700">Current Step</p>
                      <span className="ml-auto text-xs text-[#7c705d]">
                        {currentStep.stepNumber}/{currentStep.totalSteps}
                      </span>
                    </div>
                    <p className="text-sm text-[#2f3b3f]">{currentStep.stepText}</p>
                    <div className="mt-3 h-1.5 rounded-full bg-orange-100 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(currentStep.completedSteps / currentStep.totalSteps) * 100}%` }}
                        transition={{ duration: 0.45, ease: 'easeOut' }}
                        className="h-full bg-orange-500"
                      />
                    </div>
                  </div>
                </Link>
              )}

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <Link href={primaryLink} className="flex-1">
                  <button className="w-full h-12 rounded-xl bg-[#0f766e] hover:bg-[#0a605a] text-white font-semibold flex items-center justify-center gap-2">
                    {focusProject ? 'Start Next Step' : 'Find My Path'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </Link>
                <Link href={createStarterHref('I need help deciding my best move today.')} className="sm:w-auto">
                  <button className="w-full h-12 px-4 rounded-xl border border-[#d7cab5] bg-white/85 hover:bg-white text-[#324244] font-medium flex items-center justify-center gap-2">
                    Talk with Rise
                    <Sparkles className="w-4 h-4 text-[#0f766e]" />
                  </button>
                </Link>
              </div>
            </>
          )}
        </section>

        {personalGreeting && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[#d9ccb8] bg-white/70 p-4"
          >
            <p className="text-xs uppercase tracking-[0.15em] text-[#7a705f] mb-1">Rise remembers</p>
            <p className="text-sm text-[#354244]">{personalGreeting}</p>
          </motion.div>
        )}

        {dailyPrompt?.prompt_text && (
          <div className="rounded-2xl border border-[#ded1bd] bg-[#fff9ef]/80 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[#7f725d] mb-1">Daily Prompt</p>
            <p className="text-sm text-[#394547]">“{dailyPrompt.prompt_text}”</p>
            {dailyPrompt.author && <p className="text-xs text-[#7f725d] mt-1">- {dailyPrompt.author}</p>}
          </div>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl text-[#273334]">Need a Jumpstart?</h3>
            <Link href="/path-finder" className="text-sm text-[#0f766e] hover:text-[#0b5f59]">
              Open Path Finder
            </Link>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {quickPaths.map((path) => (
              <Link key={path.title} href={path.href}>
                <div className={`rounded-2xl border bg-gradient-to-br p-4 h-full hover:shadow-md transition-all ${path.tone}`}>
                  <div className="inline-flex p-2 rounded-lg bg-white/75 mb-3">
                    <path.icon className="w-4 h-4 text-[#0f766e]" />
                  </div>
                  <h4 className="font-semibold text-[#2d3a3d]">{path.title}</h4>
                  <p className="text-sm text-[#5f6968] mt-1">{path.subtitle}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <AnimatePresence>
          {visibleInsights.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <h3 className="font-display text-xl text-[#273334]">Rise Noticed</h3>
              {visibleInsights.map((insight, idx) => {
                const originalIndex = riseInsights.indexOf(insight)
                return (
                  <div key={`insight-${originalIndex}`} className="rounded-2xl border border-[#ddd0bc] bg-white/72 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-full bg-[#0f766e]/12 p-2 mt-0.5">
                        <Eye className="w-4 h-4 text-[#0f766e]" />
                      </div>
                      <div className="flex-1">
                        {idx === 0 && (
                          <p className="text-[11px] uppercase tracking-[0.15em] text-[#7f735f] mb-1">Pattern insight</p>
                        )}
                        <p className="text-sm text-[#334143]">{insight.text}</p>
                      </div>
                      <button
                        onClick={() => dismissInsight(originalIndex)}
                        className="text-[#847963] hover:text-[#3c4a4c]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </motion.section>
          )}
        </AnimatePresence>

        {projects.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-xl text-[#273334]">Your Projects</h3>
              <Link href="/projects" className="text-sm text-[#0f766e] hover:text-[#0b5f59]">View all</Link>
            </div>
            <div className="grid gap-2">
              {projects.slice(0, 3).map(project => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div className="rounded-2xl border border-[#decfbb] bg-white/75 p-4 hover:bg-white transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-[#2e3d3f]">{project.name}</p>
                        <p className="text-xs text-[#7f735f] mt-0.5">
                          {project.status} • {project.progress_percent}% complete
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#7b705c]" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {projects.length === 0 && !loadingBriefing && (
          <section className="dawn-card rounded-3xl p-6">
            <div className="inline-flex p-2 rounded-xl bg-orange-100 mb-3">
              <Rocket className="w-5 h-5 text-orange-700" />
            </div>
            <h3 className="font-display text-2xl text-[#2a3436]">No project yet. Start with one honest conversation.</h3>
            <p className="text-sm text-[#606b68] mt-2 mb-4">
              Tell Rise what you actually want from life right now. It will help you pick one path and break it into doable steps.
            </p>
            <Link href={createStarterHref('I am not sure what to build yet. Help me discover one path that fits me.')}>
              <button className="h-12 px-5 rounded-xl bg-[#0f766e] hover:bg-[#0a605a] text-white font-semibold inline-flex items-center gap-2">
                Begin Path Finder
                <Compass className="w-4 h-4" />
              </button>
            </Link>
          </section>
        )}

        {shouldShowEveningNudge(todayLog) && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link href="/evening">
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 hover:bg-indigo-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-white/75 p-2">
                    <Moon className="w-4 h-4 text-indigo-700" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-[#2f3d45]">Close your day with Rise</p>
                    <p className="text-sm text-[#607079]">2 minutes to reset and protect tomorrow&apos;s momentum.</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-indigo-700" />
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        {momentum && !loadingBriefing && (
          <div className="rounded-2xl border border-[#dfd1be] bg-white/70 px-4 py-3 flex flex-wrap items-center gap-3 text-sm text-[#5f6a69]">
            <div className="inline-flex items-center gap-1.5">
              <Sunrise className="w-4 h-4 text-orange-600" />
              {momentum.loginStreak >= 7
                ? `${momentum.loginStreak} days in a row`
                : `Day ${momentum.loginStreak || 1}`}
            </div>
            {momentum.milestonesThisWeek > 0 && (
              <div className="inline-flex items-center gap-1.5">
                <Target className="w-4 h-4 text-teal-600" />
                {momentum.milestonesThisWeek} milestone{momentum.milestonesThisWeek !== 1 ? 's' : ''} this week
              </div>
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0">
        <BottomNavigation />
      </div>
    </div>
  )
}
