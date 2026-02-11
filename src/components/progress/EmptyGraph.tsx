'use client'

import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

export function EmptyGraph() {
  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-xs"
      >
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-800 border border-slate-700 mb-5"
        >
          <Sparkles size={24} className="text-teal-400" />
        </motion.div>

        <h2 className="text-slate-200 text-lg font-medium mb-2">
          Your knowledge graph is growing
        </h2>
        <p className="text-slate-500 text-sm leading-relaxed">
          As you check in, brain dump, and explore with Rise, nodes will appear here — each one something Rise has learned about you.
        </p>
      </motion.div>
    </div>
  )
}
