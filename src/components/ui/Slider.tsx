'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'

interface SliderProps {
  min?: number
  max?: number
  value: number
  onChange: (value: number) => void
  label?: string
  showValue?: boolean
  leftLabel?: string
  rightLabel?: string
  className?: string
}

export function Slider({
  min = 1,
  max = 10,
  value,
  onChange,
  label,
  showValue = true,
  leftLabel,
  rightLabel,
  className = '',
}: SliderProps) {
  const [isDragging, setIsDragging] = useState(false)

  const percentage = ((value - min) / (max - min)) * 100

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value))
    },
    [onChange]
  )

  // Color gradient based on value (1-10 mood/energy scale)
  const getColor = (val: number) => {
    if (val <= 3) return 'from-red-500 to-orange-500'
    if (val <= 5) return 'from-orange-500 to-yellow-500'
    if (val <= 7) return 'from-yellow-500 to-teal-500'
    return 'from-teal-500 to-emerald-500'
  }

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-slate-300 font-medium">{label}</span>
          {showValue && (
            <motion.span
              key={value}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              className="text-2xl font-bold text-teal-400"
            >
              {value}
            </motion.span>
          )}
        </div>
      )}

      <div className="relative">
        {/* Track background */}
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
          {/* Filled track */}
          <motion.div
            className={`h-full bg-gradient-to-r ${getColor(value)} rounded-full`}
            style={{ width: `${percentage}%` }}
            animate={{ width: `${percentage}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        </div>

        {/* Hidden range input for accessibility */}
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={handleChange}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label={label}
        />

        {/* Thumb indicator */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-lg pointer-events-none"
          style={{ left: `calc(${percentage}% - 12px)` }}
          animate={{
            scale: isDragging ? 1.2 : 1,
            boxShadow: isDragging
              ? '0 0 20px rgba(45, 212, 191, 0.5)'
              : '0 4px 6px rgba(0, 0, 0, 0.3)',
          }}
        />
      </div>

      {/* Labels */}
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between mt-2 text-sm text-slate-500">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  )
}
