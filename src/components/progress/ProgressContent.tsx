'use client'

import { useMemo } from 'react'
import { ArrowLeft, TrendingUp, Calendar, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { WakeTimeChart } from './WakeTimeChart'
import { MoodChart } from './MoodChart'
import { WeeklyHeatmap } from './WeeklyHeatmap'
import { Card } from '@/components/ui/Card'
import type { DailyLog } from '@/lib/supabase/types'

interface ProgressContentProps {
  recentLogs: DailyLog[]
}

export function ProgressContent({
  recentLogs,
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
    }))
  }, [recentLogs])

  // Stats
  const totalDays = recentLogs.filter((l) => l.im_up_pressed_at).length
  const totalLoggedDays = recentLogs.length || 1
  const consistency = Math.round((totalDays / totalLoggedDays) * 100)
  const avgMood =
    recentLogs.filter((l) => l.morning_mood).length > 0
      ? recentLogs.filter((l) => l.morning_mood).reduce((sum, l) => sum + (l.morning_mood || 0), 0) /
        recentLogs.filter((l) => l.morning_mood).length
      : 0

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
        {/* Check-in and wellbeing snapshot */}
        <Card variant="elevated">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-100">Check-in Snapshot</h2>
            <p className="text-sm text-slate-400 mt-1">
              A calm view of your recent rhythm and wellbeing trends.
            </p>
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
              <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-emerald-400" />
              <p className="text-2xl font-bold text-slate-100">{consistency}%</p>
              <p className="text-xs text-slate-400">Check-in consistency</p>
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
      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0">
        <BottomNavigation />
      </div>
    </div>
  )
}
