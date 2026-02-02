'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  emoji?: string
  description?: string
  className?: string
}

export function Checkbox({
  checked,
  onChange,
  label,
  emoji,
  description,
  className = '',
}: CheckboxProps) {
  return (
    <motion.button
      type="button"
      onClick={() => onChange(!checked)}
      whileTap={{ scale: 0.98 }}
      className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
        checked
          ? 'bg-teal-500/10 border-teal-500/50'
          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
      } ${className}`}
    >
      {/* Checkbox */}
      <div
        className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          checked
            ? 'bg-teal-500 border-teal-500'
            : 'bg-transparent border-slate-500'
        }`}
      >
        <AnimatePresence>
          {checked && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Check className="w-4 h-4 text-white" strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Label */}
      <div className="flex-1 text-left">
        <div className="flex items-center gap-2">
          {emoji && <span className="text-lg">{emoji}</span>}
          <span className={`font-medium ${checked ? 'text-teal-300' : 'text-slate-200'}`}>
            {label}
          </span>
        </div>
        {description && (
          <p className="text-sm text-slate-400 mt-0.5">{description}</p>
        )}
      </div>
    </motion.button>
  )
}
