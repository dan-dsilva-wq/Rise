'use client'

import { type ReactNode } from 'react'
import { motion } from 'framer-motion'

interface CardProps {
  variant?: 'default' | 'elevated' | 'outline'
  className?: string
  children?: ReactNode
}

function Card({ className = '', variant = 'default', children }: CardProps) {
  const variants = {
    default: 'bg-slate-800/50 border border-slate-700/50',
    elevated: 'bg-slate-800 border border-slate-700 shadow-lg shadow-black/20',
    outline: 'bg-transparent border border-slate-700',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-6 ${variants[variant]} ${className}`}
    >
      {children}
    </motion.div>
  )
}

export { Card }
