'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Trophy } from 'lucide-react'

interface AchievementToastProps {
  show: boolean
  emoji: string
  name: string
  xpReward: number
  onClose: () => void
}

export function AchievementToast({
  show,
  emoji,
  name,
  xpReward,
  onClose,
}: AchievementToastProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50"
          onClick={onClose}
        >
          <div className="relative px-6 py-4 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 shadow-xl shadow-amber-500/30">
            {/* Shine effect */}
            <motion.div
              className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/20 to-transparent"
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: 1, repeat: 2 }}
            />

            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-2xl">{emoji}</span>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-4 h-4 text-amber-200" />
                  <span className="text-sm font-medium text-amber-200">
                    Achievement Unlocked!
                  </span>
                </div>
                <p className="text-lg font-bold text-white">{name}</p>
                <p className="text-sm text-amber-200">+{xpReward} XP</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Hook for managing achievement toasts
import { useState, useCallback } from 'react'

interface Achievement {
  emoji: string
  name: string
  xpReward: number
}

export function useAchievementToast() {
  const [current, setCurrent] = useState<Achievement | null>(null)
  const [show, setShow] = useState(false)

  const showAchievement = useCallback((achievement: Achievement) => {
    setCurrent(achievement)
    setShow(true)

    // Auto-hide after 5 seconds
    setTimeout(() => {
      setShow(false)
    }, 5000)
  }, [])

  const hideAchievement = useCallback(() => {
    setShow(false)
  }, [])

  return {
    show,
    current,
    showAchievement,
    hideAchievement,
  }
}
