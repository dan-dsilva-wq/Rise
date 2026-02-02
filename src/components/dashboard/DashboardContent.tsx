'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, TrendingUp, FolderKanban, Target, Sparkles, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { WakeButton } from '@/components/morning/WakeButton'
import { MorningChecklist } from '@/components/morning/MorningChecklist'
import { MoodSlider } from '@/components/morning/MoodSlider'
import { DailyPrompt } from '@/components/morning/DailyPrompt'
import { XpCounter } from '@/components/gamification/XpCounter'
import { StreakDisplay } from '@/components/gamification/StreakDisplay'
import { AchievementToast, useAchievementToast } from '@/components/gamification/AchievementToast'
import { MissionCard } from '@/components/missions/MissionCard'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useDailyLog } from '@/lib/hooks/useDailyLog'
import { useMissions } from '@/lib/hooks/useMissions'
import { useUser } from '@/lib/hooks/useUser'
import type { Profile, DailyLog, DailyMission } from '@/lib/supabase/types'

interface DashboardContentProps {
  profile: Profile | null
  todayLog: DailyLog | null
  dailyPrompt: { prompt_text: string; author: string | null }
  initialMission?: DailyMission | null
}

export function DashboardContent({
  profile: initialProfile,
  todayLog: initialTodayLog,
  dailyPrompt,
  initialMission,
}: DashboardContentProps) {
  const { user, profile, refreshProfile } = useUser()
  const { todayLog, pressImUp, updateChecklist, updateMoodEnergy } = useDailyLog(user?.id)
  const { primaryMission, completeMission, skipMission, generateMissions, loading: missionsLoading } = useMissions(user?.id)
  const { show: showAchievement, current: currentAchievement, hideAchievement } = useAchievementToast()

  const [recentXpGain, setRecentXpGain] = useState(0)
  const [energy, setEnergy] = useState(initialTodayLog?.morning_energy || 5)
  const [mood, setMood] = useState(initialTodayLog?.morning_mood || 5)
  const [showMoodSaved, setShowMoodSaved] = useState(false)
  const [savingMood, setSavingMood] = useState(false)
  const [moodError, setMoodError] = useState<string | null>(null)

  const currentProfile = profile || initialProfile
  const currentLog = todayLog || initialTodayLog
  const currentMission = missionsLoading ? initialMission : primaryMission

  const hasCheckedIn = currentLog?.im_up_pressed_at !== null

  // Generate missions when user checks in
  useEffect(() => {
    if (hasCheckedIn && user?.id) {
      generateMissions()
    }
  }, [hasCheckedIn, user?.id, generateMissions])

  const handleImUp = async () => {
    try {
      const { xpEarned } = await pressImUp()
      setRecentXpGain(xpEarned)
      await refreshProfile()
      setTimeout(() => setRecentXpGain(0), 3000)
    } catch (error) {
      console.error('Error pressing I\'m Up:', error)
    }
  }

  const handleChecklistToggle = async (field: 'feetOnFloor' | 'lightExposure' | 'drankWater') => {
    const fieldMap = {
      feetOnFloor: 'feet_on_floor',
      lightExposure: 'light_exposure',
      drankWater: 'drank_water',
    } as const

    const currentValue = currentLog?.[fieldMap[field]] ?? false
    try {
      const xp = await updateChecklist(fieldMap[field], !currentValue)
      if (xp > 0) {
        setRecentXpGain(xp)
        await refreshProfile()
        setTimeout(() => setRecentXpGain(0), 3000)
      }
    } catch (error) {
      console.error('Error updating checklist:', error)
    }
  }

  const handleSaveMood = async () => {
    setSavingMood(true)
    setMoodError(null)
    try {
      const xp = await updateMoodEnergy(energy, mood)
      if (xp > 0) {
        setRecentXpGain(xp)
        await refreshProfile()
        setTimeout(() => setRecentXpGain(0), 3000)
      }
      setShowMoodSaved(true)
      setTimeout(() => setShowMoodSaved(false), 2000)
    } catch (error) {
      console.error('Error saving mood:', error)
      setMoodError('Failed to save. Try again.')
      setTimeout(() => setMoodError(null), 3000)
    } finally {
      setSavingMood(false)
    }
  }

  const handleCompleteMission = async () => {
    if (!currentMission) return 0
    const xp = await completeMission(currentMission.id)
    if (xp > 0) {
      setRecentXpGain(xp)
      await refreshProfile()
      setTimeout(() => setRecentXpGain(0), 3000)
    }
    return xp
  }

  const handleSkipMission = () => {
    if (currentMission) {
      skipMission(currentMission.id)
    }
  }

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
        {/* XP and Streak Bar */}
        <Card variant="elevated">
          <div className="flex items-center justify-between">
            <XpCounter
              totalXp={currentProfile?.total_xp || 0}
              level={currentProfile?.current_level || 1}
              recentGain={recentXpGain}
              className="flex-1"
            />
            <div className="pl-4 border-l border-slate-700">
              <StreakDisplay
                streak={currentProfile?.current_streak || 0}
                longestStreak={currentProfile?.longest_streak || 0}
                size="md"
              />
            </div>
          </div>
        </Card>

        {/* Today's Mission - Show after check-in */}
        {hasCheckedIn && currentMission && (
          <MissionCard
            mission={currentMission}
            isPrimary
            onComplete={handleCompleteMission}
            onSkip={handleSkipMission}
          />
        )}

        {/* No Mission - Prompt to find path */}
        {hasCheckedIn && !currentMission && !missionsLoading && (
          <Link href="/path-finder">
            <Card className="bg-gradient-to-br from-purple-900/30 to-slate-800/50 border-purple-700/30 hover:border-purple-600/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-purple-500/10">
                  <Target className="w-6 h-6 text-purple-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white">Find Your Mission</h3>
                  <p className="text-sm text-slate-400">Discover what to build today</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </div>
            </Card>
          </Link>
        )}

        {/* Daily Prompt */}
        <DailyPrompt
          prompt={dailyPrompt.prompt_text}
          author={dailyPrompt.author}
        />

        {/* Main Content - depends on check-in status */}
        {!hasCheckedIn ? (
          /* Not checked in yet - show Wake Button */
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center py-8"
          >
            <WakeButton onPress={handleImUp} isPressed={false} />
          </motion.div>
        ) : (
          /* Checked in - show checklist and mood */
          <AnimatePresence mode="wait">
            <motion.div
              key="checked-in"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Success message */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-500/10 border border-teal-500/30">
                  <span className="text-2xl">☀️</span>
                  <span className="text-teal-400 font-medium">You&apos;re up!</span>
                </div>
              </motion.div>

              {/* Morning Checklist */}
              <Card>
                <MorningChecklist
                  feetOnFloor={currentLog?.feet_on_floor ?? false}
                  lightExposure={currentLog?.light_exposure ?? false}
                  drankWater={currentLog?.drank_water ?? false}
                  onToggle={handleChecklistToggle}
                />
              </Card>

              {/* Mood & Energy */}
              <Card>
                <h3 className="text-lg font-semibold text-slate-200 mb-4">
                  How are you feeling?
                </h3>
                <MoodSlider
                  energy={energy}
                  mood={mood}
                  onEnergyChange={setEnergy}
                  onMoodChange={setMood}
                />
                <div className="mt-6 flex items-center gap-3">
                  <Button onClick={handleSaveMood} isLoading={savingMood} className="flex-1">
                    Save check-in
                  </Button>
                  <AnimatePresence>
                    {showMoodSaved && (
                      <motion.span
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="text-teal-400 text-sm"
                      >
                        Saved!
                      </motion.span>
                    )}
                    {moodError && (
                      <motion.span
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="text-red-400 text-sm"
                      >
                        {moodError}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </Card>
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 safe-bottom">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-around">
          <Link
            href="/"
            className="flex flex-col items-center gap-1 text-teal-400"
          >
            <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center">
              <span className="text-xs text-white font-bold">R</span>
            </div>
            <span className="text-xs">Today</span>
          </Link>

          <Link
            href="/projects"
            className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-200"
          >
            <FolderKanban className="w-6 h-6" />
            <span className="text-xs">Projects</span>
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

      {/* Achievement Toast */}
      {currentAchievement && (
        <AchievementToast
          show={showAchievement}
          emoji={currentAchievement.emoji}
          name={currentAchievement.name}
          xpReward={currentAchievement.xpReward}
          onClose={hideAchievement}
        />
      )}
    </div>
  )
}
