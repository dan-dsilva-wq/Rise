'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { format, parseISO } from 'date-fns'

interface WakeTimeData {
  date: string
  wakeTime: string | null
}

interface WakeTimeChartProps {
  data: WakeTimeData[]
  className?: string
}

// Convert time string to minutes from midnight for charting
function timeToMinutes(timeStr: string): number {
  const date = parseISO(timeStr)
  return date.getHours() * 60 + date.getMinutes()
}

// Convert minutes back to time string
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`
}

export function WakeTimeChart({ data, className = '' }: WakeTimeChartProps) {
  const chartData = useMemo(() => {
    return data
      .filter((d) => d.wakeTime)
      .map((d) => ({
        date: format(parseISO(d.date), 'EEE'),
        fullDate: format(parseISO(d.date), 'MMM d'),
        minutes: timeToMinutes(d.wakeTime!),
      }))
      .slice(-7) // Last 7 days
  }, [data])

  if (chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center h-48 ${className}`}>
        <p className="text-slate-500">No wake time data yet</p>
      </div>
    )
  }

  // Calculate average
  const avgMinutes = Math.round(
    chartData.reduce((sum, d) => sum + d.minutes, 0) / chartData.length
  )

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-200">Wake Time Trend</h3>
        <span className="text-sm text-slate-400">
          Avg: {minutesToTime(avgMinutes)}
        </span>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis
              dataKey="date"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[300, 600]} // 5 AM to 10 AM
              tickFormatter={minutesToTime}
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={70}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload
                  return (
                    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-lg">
                      <p className="text-slate-300 text-sm">{data.fullDate}</p>
                      <p className="text-teal-400 font-medium">
                        {minutesToTime(data.minutes)}
                      </p>
                    </div>
                  )
                }
                return null
              }}
            />
            <ReferenceLine
              y={avgMinutes}
              stroke="#64748b"
              strokeDasharray="5 5"
            />
            <Line
              type="monotone"
              dataKey="minutes"
              stroke="#2dd4bf"
              strokeWidth={2}
              dot={{ fill: '#2dd4bf', strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: '#2dd4bf' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
