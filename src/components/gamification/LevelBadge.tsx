'use client'

import { motion } from 'framer-motion'
import { levelProgress } from '@/lib/gamification/xp-values'

interface LevelBadgeProps {
  level: number
  totalXp: number
  size?: 'sm' | 'md' | 'lg'
  showProgress?: boolean
  className?: string
}

export function LevelBadge({
  level,
  totalXp,
  size = 'md',
  showProgress = false,
  className = '',
}: LevelBadgeProps) {
  const progress = levelProgress(totalXp)

  const sizes = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-12 h-12 text-lg',
    lg: 'w-16 h-16 text-2xl',
  }

  // Color tiers based on level
  const getGradient = () => {
    if (level >= 15) return 'from-amber-400 to-yellow-500' // Gold
    if (level >= 10) return 'from-purple-500 to-pink-500' // Purple
    if (level >= 5) return 'from-blue-500 to-cyan-500' // Blue
    return 'from-teal-500 to-emerald-600' // Teal (default)
  }

  return (
    <div className={`relative inline-flex ${className}`}>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`${sizes[size]} rounded-full bg-gradient-to-br ${getGradient()} flex items-center justify-center shadow-lg`}
      >
        <span className="font-bold text-white">{level}</span>
      </motion.div>

      {showProgress && (
        <svg
          className="absolute inset-0 -rotate-90"
          viewBox="0 0 36 36"
        >
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-slate-700"
          />
          <motion.circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${progress} 100`}
            strokeLinecap="round"
            className="text-teal-400"
            initial={{ strokeDasharray: '0 100' }}
            animate={{ strokeDasharray: `${progress} 100` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
      )}
    </div>
  )
}
