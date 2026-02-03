'use client'

import { motion } from 'framer-motion'
import { Quote } from 'lucide-react'

interface DailyPromptProps {
  prompt: string
  author?: string | null
  className?: string
}

export function DailyPrompt({ prompt, author, className = '' }: DailyPromptProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative p-6 rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-800/40 border border-slate-700/50 ${className}`}
    >
      <Quote className="absolute top-4 left-4 w-6 h-6 text-teal-500/30" />

      <blockquote className="text-lg text-slate-200 italic leading-relaxed pl-6">
        &ldquo;{prompt}&rdquo;
      </blockquote>

      {author && (
        <p className="mt-3 text-sm text-slate-400 text-right">— {author}</p>
      )}
    </motion.div>
  )
}
