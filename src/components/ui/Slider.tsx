'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

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
  touched?: boolean
  onTouch?: () => void
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
  touched: controlledTouched,
  onTouch,
}: SliderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [internalTouched, setInternalTouched] = useState(false)

  // Use controlled touched state if provided, otherwise use internal
  const isTouched = controlledTouched !== undefined ? controlledTouched : internalTouched

  // If value differs from initial default (5), consider it touched
  useEffect(() => {
    if (controlledTouched === undefined && value !== 5) {
      setInternalTouched(true)
    }
  }, [value, controlledTouched])

  const percentage = ((value - min) / (max - min)) * 100

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isTouched) {
        setInternalTouched(true)
        onTouch?.()
      }
      onChange(Number(e.target.value))
    },
    [onChange, isTouched, onTouch]
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
          <div className="flex items-center gap-2">
            <span className="text-slate-300 font-medium">{label}</span>
            <AnimatePresence>
              {!isTouched && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full"
                >
                  Adjust me
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          {showValue && (
            <motion.span
              key={`${value}-${isTouched}`}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              className={`text-2xl font-bold transition-colors ${
                isTouched ? 'text-teal-400' : 'text-slate-500'
              }`}
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
          className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full shadow-lg pointer-events-none ${
            isTouched ? 'bg-white' : 'bg-slate-300'
          }`}
          style={{ left: `calc(${percentage}% - 12px)` }}
          animate={{
            scale: isDragging ? 1.2 : isTouched ? 1 : [1, 1.1, 1],
            boxShadow: isDragging
              ? '0 0 20px rgba(45, 212, 191, 0.5)'
              : isTouched
              ? '0 4px 6px rgba(0, 0, 0, 0.3)'
              : '0 0 12px rgba(148, 163, 184, 0.4)',
          }}
          transition={
            !isTouched && !isDragging
              ? { scale: { repeat: Infinity, duration: 2, ease: 'easeInOut' } }
              : undefined
          }
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
