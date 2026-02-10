'use client'

import { motion } from 'framer-motion'

interface StepIndicatorProps {
  current: number
  total: number
}

export function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <motion.div
          key={i}
          className={`rounded-full transition-colors ${
            i + 1 === current
              ? 'w-6 h-2 bg-teal-400'
              : i + 1 < current
                ? 'w-2 h-2 bg-teal-400/50'
                : 'w-2 h-2 bg-slate-600'
          }`}
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      ))}
    </div>
  )
}
