'use client'

import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'

export function EmptyGraph() {
  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-xs"
      >
        {/* Rotating arc animation */}
        <div className="relative inline-flex items-center justify-center w-14 h-14 mb-5">
          <motion.svg
            width={56}
            height={56}
            viewBox="0 0 56 56"
            className="absolute inset-0"
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          >
            <circle
              cx={28}
              cy={28}
              r={26}
              fill="none"
              stroke="#5b9fa6"
              strokeWidth={1}
              strokeDasharray="40 120"
              strokeLinecap="round"
              opacity={0.5}
            />
          </motion.svg>
          <div className="rounded-full bg-slate-800 border border-slate-700 w-10 h-10 flex items-center justify-center">
            <Activity size={18} className="text-slate-500" />
          </div>
        </div>

        <h2 className="text-slate-200 text-lg font-medium mb-2">
          Initializing knowledge network
        </h2>
        <p className="text-slate-500 text-sm leading-relaxed">
          Nodes will populate as patterns, goals, and context are extracted from your sessions.
        </p>
      </motion.div>
    </div>
  )
}
