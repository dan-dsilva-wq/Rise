'use client'

import { motion } from 'framer-motion'
import { Flame } from 'lucide-react'

interface StreakDisplayProps {
  streak: number
  longestStreak?: number
  showLongest?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function StreakDisplay({
  streak,
  longestStreak = 0,
  showLongest = false,
  size = 'md',
  className = '',
}: StreakDisplayProps) {
  const isActive = streak > 0

  const sizes = {
    sm: { container: 'gap-1', icon: 'w-4 h-4', text: 'text-sm' },
    md: { container: 'gap-2', icon: 'w-6 h-6', text: 'text-lg' },
    lg: { container: 'gap-3', icon: 'w-10 h-10', text: 'text-3xl' },
  }

  const s = sizes[size]

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className={`flex items-center ${s.container}`}>
        <motion.div
          animate={
            isActive
              ? {
                  scale: [1, 1.1, 1],
                  rotate: [-5, 5, -5, 0],
                }
              : {}
          }
          transition={{
            duration: 1.5,
            repeat: Infinity,
            repeatType: 'reverse',
          }}
        >
          <Flame
            className={`${s.icon} ${
              isActive ? 'text-orange-500 fill-orange-500/30' : 'text-slate-600'
            }`}
          />
        </motion.div>

        <motion.span
          key={streak}
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          className={`${s.text} font-bold ${
            isActive ? 'text-orange-400' : 'text-slate-500'
          }`}
        >
          {streak}
        </motion.span>
      </div>

      <span className="text-xs text-slate-500 mt-1">
        {streak === 1 ? 'day' : 'days'}
      </span>

      {showLongest && longestStreak > 0 && (
        <span className="text-xs text-slate-600 mt-1">
          Best: {longestStreak}
        </span>
      )}
    </div>
  )
}
