'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { format, parseISO, startOfWeek, addDays, isSameDay } from 'date-fns'

interface HeatmapData {
  date: string
  completed: boolean
  xpEarned?: number
}

interface WeeklyHeatmapProps {
  data: HeatmapData[]
  weeksToShow?: number
  className?: string
}

const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function WeeklyHeatmap({
  data,
  weeksToShow = 4,
  className = '',
}: WeeklyHeatmapProps) {
  const weeks = useMemo(() => {
    const today = new Date()
    const result: { date: Date; completed: boolean; xp: number }[][] = []

    for (let w = weeksToShow - 1; w >= 0; w--) {
      const weekStart = startOfWeek(addDays(today, -w * 7), { weekStartsOn: 1 })
      const week: { date: Date; completed: boolean; xp: number }[] = []

      for (let d = 0; d < 7; d++) {
        const date = addDays(weekStart, d)
        const dayData = data.find((item) =>
          isSameDay(parseISO(item.date), date)
        )

        week.push({
          date,
          completed: dayData?.completed ?? false,
          xp: dayData?.xpEarned ?? 0,
        })
      }

      result.push(week)
    }

    return result
  }, [data, weeksToShow])

  // Get intensity based on XP earned
  const getIntensity = (xp: number): string => {
    if (xp === 0) return 'bg-slate-800'
    if (xp < 50) return 'bg-teal-900/50'
    if (xp < 100) return 'bg-teal-700/60'
    if (xp < 150) return 'bg-teal-600/70'
    return 'bg-teal-500'
  }

  return (
    <div className={className}>
      <h3 className="text-lg font-semibold text-slate-200 mb-4">Activity</h3>

      <div className="flex gap-2">
        {/* Day labels */}
        <div className="flex flex-col gap-1 text-xs text-slate-500">
          {dayLabels.map((day, i) => (
            <div key={i} className="h-8 flex items-center justify-center w-4">
              {day}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="flex gap-1 flex-1">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-1 flex-1">
              {week.map((day, dayIndex) => {
                const isToday = isSameDay(day.date, new Date())
                const isFuture = day.date > new Date()

                return (
                  <motion.div
                    key={dayIndex}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: (weekIndex * 7 + dayIndex) * 0.02 }}
                    className={`h-8 rounded-lg transition-colors ${
                      isFuture
                        ? 'bg-slate-900/30'
                        : getIntensity(day.xp)
                    } ${isToday ? 'ring-2 ring-teal-400 ring-offset-1 ring-offset-slate-900' : ''}`}
                    title={`${format(day.date, 'MMM d')}: ${day.xp} XP`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-4 text-xs text-slate-500">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-4 h-4 rounded bg-slate-800" />
          <div className="w-4 h-4 rounded bg-teal-900/50" />
          <div className="w-4 h-4 rounded bg-teal-700/60" />
          <div className="w-4 h-4 rounded bg-teal-600/70" />
          <div className="w-4 h-4 rounded bg-teal-500" />
        </div>
        <span>More</span>
      </div>
    </div>
  )
}
