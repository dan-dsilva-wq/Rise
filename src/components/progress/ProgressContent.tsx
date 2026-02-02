'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Award, TrendingUp, Moon, Calendar } from 'lucide-react'
import Link from 'next/link'
import { WakeTimeChart } from './WakeTimeChart'
import { MoodChart } from './MoodChart'
import { WeeklyHeatmap } from './WeeklyHeatmap'
import { XpCounter } from '@/components/gamification/XpCounter'
import { StreakDisplay } from '@/components/gamification/StreakDisplay'
import { TierProgress } from '@/components/gamification/TierProgress'
import { Card } from '@/components/ui/Card'
import type { Profile, DailyLog, Achievement } from '@/lib/supabase/types'
import { TierNumber } from '@/lib/gamification/xp-values'

interface ProgressContentProps {
  profile: Profile | null
  recentLogs: DailyLog[]
  userAchievements: Array<{ achievements: Achievement; unlocked_at: string }>
  allAchievements: Achievement[]
}

export function ProgressContent({
  profile,
  recentLogs,
  userAchievements,
  allAchievements,
}: ProgressContentProps) {
  // Prepare data for charts
  const wakeTimeData = useMemo(() => {
    return recentLogs.map((log) => ({
      date: log.log_date,
      wakeTime: log.wake_time,
    }))
  }, [recentLogs])

  const moodData = useMemo(() => {
    return recentLogs.map((log) => ({
      date: log.log_date,
      morningMood: log.morning_mood,
      morningEnergy: log.morning_energy,
      eveningMood: log.evening_mood,
      eveningEnergy: log.evening_energy,
    }))
  }, [recentLogs])

  const heatmapData = useMemo(() => {
    return recentLogs.map((log) => ({
      date: log.log_date,
      completed: log.im_up_pressed_at !== null,
      xpEarned: log.xp_earned,
    }))
  }, [recentLogs])

  // Stats
  const totalDays = recentLogs.filter((l) => l.im_up_pressed_at).length
  const avgMood =
    recentLogs.filter((l) => l.morning_mood).length > 0
      ? recentLogs.filter((l) => l.morning_mood).reduce((sum, l) => sum + (l.morning_mood || 0), 0) /
        recentLogs.filter((l) => l.morning_mood).length
      : 0

  const unlockedAchievementIds = new Set(userAchievements.map((ua) => ua.achievements.id))

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-full hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <h1 className="text-xl font-bold text-slate-100">Your Progress</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* XP and Stats */}
        <Card variant="elevated">
          <div className="flex items-center justify-between mb-4">
            <XpCounter
              totalXp={profile?.total_xp || 0}
              level={profile?.current_level || 1}
              className="flex-1"
            />
            <div className="pl-4 border-l border-slate-700">
              <StreakDisplay
                streak={profile?.current_streak || 0}
                longestStreak={profile?.longest_streak || 0}
                showLongest
                size="md"
              />
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-700">
            <div className="text-center">
              <Calendar className="w-5 h-5 mx-auto mb-1 text-teal-400" />
              <p className="text-2xl font-bold text-slate-100">{totalDays}</p>
              <p className="text-xs text-slate-400">Days active</p>
            </div>
            <div className="text-center">
              <TrendingUp className="w-5 h-5 mx-auto mb-1 text-amber-400" />
              <p className="text-2xl font-bold text-slate-100">{avgMood.toFixed(1)}</p>
              <p className="text-xs text-slate-400">Avg mood</p>
            </div>
            <div className="text-center">
              <Award className="w-5 h-5 mx-auto mb-1 text-purple-400" />
              <p className="text-2xl font-bold text-slate-100">{userAchievements.length}</p>
              <p className="text-xs text-slate-400">Achievements</p>
            </div>
          </div>
        </Card>

        {/* Heatmap */}
        <Card>
          <WeeklyHeatmap data={heatmapData} weeksToShow={4} />
        </Card>

        {/* Wake Time Chart */}
        <Card>
          <WakeTimeChart data={wakeTimeData} />
        </Card>

        {/* Mood Chart */}
        <Card>
          <MoodChart data={moodData} />
        </Card>

        {/* Tier Progress */}
        <Card>
          <TierProgress
            currentTier={(profile?.unlock_tier || 1) as TierNumber}
            totalXp={profile?.total_xp || 0}
          />
        </Card>

        {/* Achievements */}
        <Card>
          <h3 className="text-lg font-semibold text-slate-200 mb-4">Achievements</h3>
          <div className="grid grid-cols-4 gap-3">
            {allAchievements.slice(0, 12).map((achievement, index) => {
              const isUnlocked = unlockedAchievementIds.has(achievement.id)
              return (
                <motion.div
                  key={achievement.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className={`aspect-square rounded-xl flex items-center justify-center text-2xl ${
                    isUnlocked
                      ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30'
                      : 'bg-slate-800/50 border border-slate-700/50 opacity-40'
                  }`}
                  title={isUnlocked ? achievement.name : '???'}
                >
                  {isUnlocked ? achievement.emoji : '?'}
                </motion.div>
              )
            })}
          </div>
          {allAchievements.length > 12 && (
            <p className="text-sm text-slate-500 text-center mt-3">
              +{allAchievements.length - 12} more achievements
            </p>
          )}
        </Card>
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
            href="/progress"
            className="flex flex-col items-center gap-1 text-teal-400"
          >
            <TrendingUp className="w-6 h-6" />
            <span className="text-xs">Progress</span>
          </Link>

          <Link
            href="/evening"
            className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-200"
          >
            <Moon className="w-6 h-6" />
            <span className="text-xs">Evening</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
