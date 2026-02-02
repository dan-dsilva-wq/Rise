'use client'

import { motion } from 'framer-motion'
import { Checkbox } from '@/components/ui/Checkbox'

interface MorningChecklistProps {
  feetOnFloor: boolean
  lightExposure: boolean
  drankWater: boolean
  onToggle: (field: 'feetOnFloor' | 'lightExposure' | 'drankWater') => void
  className?: string
}

const checklistItems = [
  {
    field: 'feetOnFloor' as const,
    label: 'Feet on the floor',
    emoji: '🦶',
    description: 'You got out of bed',
  },
  {
    field: 'lightExposure' as const,
    label: 'Light exposure',
    emoji: '☀️',
    description: 'Natural light or bright lights',
  },
  {
    field: 'drankWater' as const,
    label: 'Drank water',
    emoji: '💧',
    description: 'Rehydrate after sleep',
  },
]

export function MorningChecklist({
  feetOnFloor,
  lightExposure,
  drankWater,
  onToggle,
  className = '',
}: MorningChecklistProps) {
  const values = { feetOnFloor, lightExposure, drankWater }
  const completedCount = Object.values(values).filter(Boolean).length

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-200">Morning checklist</h3>
        <span className="text-sm text-slate-400">
          {completedCount}/{checklistItems.length}
        </span>
      </div>

      <div className="space-y-3">
        {checklistItems.map((item, index) => (
          <motion.div
            key={item.field}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Checkbox
              checked={values[item.field]}
              onChange={() => onToggle(item.field)}
              label={item.label}
              emoji={item.emoji}
              description={item.description}
            />
          </motion.div>
        ))}
      </div>

      {completedCount === checklistItems.length && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-center"
        >
          <span className="text-teal-400 font-medium">All done! +35 XP</span>
        </motion.div>
      )}
    </div>
  )
}
