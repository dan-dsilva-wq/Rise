'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun } from 'lucide-react'

interface WakeButtonProps {
  onPress: () => Promise<void>
  isPressed?: boolean
  className?: string
}

export function WakeButton({ onPress, isPressed = false, className = '' }: WakeButtonProps) {
  const [isPressing, setIsPressing] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePress = async () => {
    if (isPressed || isPressing) return

    setIsPressing(true)
    setError(null)
    try {
      await onPress()
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    } catch (err) {
      console.error('WakeButton error:', err)
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
      setTimeout(() => setError(null), 10000)
    } finally {
      setIsPressing(false)
    }
  }

  if (isPressed) {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`flex flex-col items-center ${className}`}
      >
        <div className="w-40 h-40 rounded-full bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border-2 border-teal-500/50 flex items-center justify-center">
          <Sun className="w-16 h-16 text-teal-400" />
        </div>
        <p className="mt-4 text-teal-400 font-medium">You're up!</p>
      </motion.div>
    )
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <motion.button
        onClick={handlePress}
        disabled={isPressing}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="relative w-56 h-56 rounded-full focus:outline-none focus:ring-4 focus:ring-teal-500/50"
      >
        {/* Outer glow */}
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 opacity-20"
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Main button */}
        <motion.div
          className="absolute inset-2 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 shadow-lg shadow-teal-500/30 flex items-center justify-center"
          animate={{
            boxShadow: isPressing
              ? '0 0 60px rgba(45, 212, 191, 0.6)'
              : '0 10px 40px rgba(45, 212, 191, 0.3)',
          }}
        >
          {isPressing ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: 360 }}
              transition={{ duration: 0.5 }}
            >
              <Sun className="w-20 h-20 text-white" />
            </motion.div>
          ) : (
            <div className="text-center text-white">
              <Sun className="w-16 h-16 mx-auto mb-2" />
              <span className="text-2xl font-bold tracking-wide">I'M UP</span>
            </div>
          )}
        </motion.div>
      </motion.button>

      {/* Success animation */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-4 text-teal-400 font-medium"
          >
            +50 XP
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error display */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg max-w-xs"
        >
          <p className="text-red-400 text-sm text-center">{error}</p>
        </motion.div>
      )}

      <p className="mt-4 text-slate-400 text-sm">Tap to start your day</p>
    </div>
  )
}
