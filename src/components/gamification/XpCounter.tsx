'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { levelProgress, xpForNextLevel, LEVEL_THRESHOLDS } from '@/lib/gamification/xp-values'

interface XpCounterProps {
  totalXp: number
  level: number
  recentGain?: number
  className?: string
}

export function XpCounter({ totalXp, level, recentGain, className = '' }: XpCounterProps) {
  const progress = levelProgress(totalXp)
  const nextLevelXp = xpForNextLevel(level)
  const currentLevelXp = LEVEL_THRESHOLDS[level - 1] || 0
  const xpInLevel = totalXp - currentLevelXp

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {/* Level badge */}
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
        <span className="text-lg font-bold text-white">{level}</span>
      </div>

      {/* XP bar */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-slate-400">Level {level}</span>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-slate-200">
              {totalXp.toLocaleString()} XP
            </span>
            <AnimatePresence>
              {recentGain && recentGain > 0 && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-sm font-medium text-teal-400"
                >
                  +{recentGain}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 50 }}
          />
        </div>

        <div className="flex justify-between mt-1 text-xs text-slate-500">
          <span>{xpInLevel} XP</span>
          <span>{nextLevelXp - currentLevelXp} XP to level {level + 1}</span>
        </div>
      </div>
    </div>
  )
}
