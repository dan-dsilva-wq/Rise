'use client'

import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'

interface MoodData {
  date: string
  morningMood: number | null
  morningEnergy: number | null
  eveningMood?: number | null
  eveningEnergy?: number | null
}

interface MoodChartProps {
  data: MoodData[]
  showEvening?: boolean
  className?: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MoodChart({ data, showEvening = false, className = '' }: MoodChartProps) {
  const chartData = useMemo(() => {
    return data
      .filter((d) => d.morningMood !== null || d.morningEnergy !== null)
      .map((d) => ({
        date: format(parseISO(d.date), 'EEE'),
        fullDate: format(parseISO(d.date), 'MMM d'),
        mood: d.morningMood,
        energy: d.morningEnergy,
        eveningMood: d.eveningMood,
        eveningEnergy: d.eveningEnergy,
      }))
      .slice(-7)
  }, [data])

  if (chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center h-48 ${className}`}>
        <p className="text-slate-500">No mood data yet</p>
      </div>
    )
  }

  // Calculate averages
  const avgMood =
    chartData.filter((d) => d.mood).reduce((sum, d) => sum + (d.mood || 0), 0) /
    chartData.filter((d) => d.mood).length

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-200">Mood & Energy</h3>
        <span className="text-sm text-slate-400">
          Avg mood: {avgMood.toFixed(1)}
        </span>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[1, 10]}
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload
                  return (
                    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-lg">
                      <p className="text-slate-300 text-sm mb-1">{data.fullDate}</p>
                      {data.mood && (
                        <p className="text-teal-400">Mood: {data.mood}</p>
                      )}
                      {data.energy && (
                        <p className="text-amber-400">Energy: {data.energy}</p>
                      )}
                    </div>
                  )
                }
                return null
              }}
            />
            <Area
              type="monotone"
              dataKey="mood"
              stroke="#2dd4bf"
              strokeWidth={2}
              fill="url(#moodGradient)"
              dot={{ fill: '#2dd4bf', strokeWidth: 0, r: 3 }}
            />
            <Area
              type="monotone"
              dataKey="energy"
              stroke="#fbbf24"
              strokeWidth={2}
              fill="url(#energyGradient)"
              dot={{ fill: '#fbbf24', strokeWidth: 0, r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-6 mt-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-teal-500" />
          <span className="text-sm text-slate-400">Mood</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <span className="text-sm text-slate-400">Energy</span>
        </div>
      </div>
    </div>
  )
}
