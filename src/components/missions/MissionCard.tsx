'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, Sparkles, Target, SkipForward, FolderKanban } from 'lucide-react'
import Link from 'next/link'
import type { DailyMission } from '@/lib/supabase/types'

interface MissionCardProps {
  mission: DailyMission
  isPrimary?: boolean
  onComplete: () => Promise<number>
  onSkip?: () => void
}

export function MissionCard({ mission, isPrimary = false, onComplete, onSkip }: MissionCardProps) {
  const [isCompleting, setIsCompleting] = useState(false)
  const [recentXp, setRecentXp] = useState(0)

  const isCompleted = mission.status === 'completed'
  const isSkipped = mission.status === 'skipped'

  const handleComplete = async () => {
    if (isCompleted || isCompleting) return

    setIsCompleting(true)
    const xp = await onComplete()

    if (xp > 0) {
      setRecentXp(xp)
      setTimeout(() => setRecentXp(0), 3000)
    }

    setIsCompleting(false)
  }

  if (isPrimary) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`
          p-5 rounded-2xl border-2 transition-all
          ${isCompleted
            ? 'bg-teal-500/10 border-teal-500/30'
            : 'bg-gradient-to-br from-teal-900/30 to-slate-800/50 border-teal-700/30'
          }
        `}
      >
        <div className="flex items-start gap-4">
          {/* Complete Button */}
          <button
            onClick={handleComplete}
            disabled={isCompleted || isCompleting}
            className={`
              flex-shrink-0 mt-1 transition-all
              ${isCompleted ? 'text-teal-500' : 'text-teal-400 hover:text-teal-300'}
            `}
          >
            {isCompleting ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-8 h-8"
              >
                <Circle className="w-8 h-8" />
              </motion.div>
            ) : isCompleted ? (
              <CheckCircle2 className="w-8 h-8" />
            ) : (
              <div className="w-8 h-8 rounded-full border-2 border-teal-500 flex items-center justify-center">
                <Target className="w-5 h-5" />
              </div>
            )}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-teal-400 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Today&apos;s Mission
            </div>
            <h3 className={`text-lg font-semibold ${isCompleted ? 'text-slate-400 line-through' : 'text-white'}`}>
              {mission.title}
            </h3>
            {mission.description && (
              <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                {mission.description}
              </p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  {mission.xp_reward} XP
                </span>

                {mission.project_id && (
                  <Link
                    href={`/projects/${mission.project_id}`}
                    className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                  >
                    <FolderKanban className="w-3 h-3" />
                    View Project
                  </Link>
                )}

                {/* XP Gain Animation */}
                <AnimatePresence>
                  {recentXp > 0 && (
                    <motion.span
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-sm text-teal-400 font-medium"
                    >
                      +{recentXp} XP!
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {!isCompleted && !isSkipped && onSkip && (
                <button
                  onClick={onSkip}
                  className="text-xs text-slate-500 hover:text-slate-400 flex items-center gap-1"
                >
                  <SkipForward className="w-3 h-3" />
                  Skip
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  // Non-primary (smaller) variant
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`
        p-3 rounded-xl border transition-all
        ${isCompleted
          ? 'bg-teal-500/5 border-teal-500/20'
          : isSkipped
            ? 'bg-slate-800/30 border-slate-700/20 opacity-50'
            : 'bg-slate-800/30 border-slate-700/30'
        }
      `}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={handleComplete}
          disabled={isCompleted || isSkipped || isCompleting}
          className={`
            flex-shrink-0 transition-colors
            ${isCompleted ? 'text-teal-500' : 'text-slate-500 hover:text-teal-400'}
          `}
        >
          {isCompleting ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Circle className="w-5 h-5" />
            </motion.div>
          ) : isCompleted ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <span className={`text-sm ${isCompleted ? 'text-slate-400 line-through' : isSkipped ? 'text-slate-500' : 'text-white'}`}>
            {mission.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{mission.xp_reward} XP</span>

          <AnimatePresence>
            {recentXp > 0 && (
              <motion.span
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs text-teal-400 font-medium"
              >
                +{recentXp}!
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
