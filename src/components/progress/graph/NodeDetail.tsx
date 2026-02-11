'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { GraphNode } from './types'
import { CATEGORY_COLORS, CATEGORY_LABELS } from './constants'

interface NodeDetailProps {
  node: GraphNode | null
  connectedNodes: GraphNode[]
  onClose: () => void
}

export function NodeDetail({ node, connectedNodes, onClose }: NodeDetailProps) {
  return (
    <AnimatePresence>
      {node && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-slate-800 border-t border-slate-700 rounded-t-2xl max-h-[60vh] overflow-y-auto"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>

            <div className="px-5 pb-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: CATEGORY_COLORS[node.category] + '20',
                    color: CATEGORY_COLORS[node.category],
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[node.category] }}
                  />
                  {CATEGORY_LABELS[node.category]}
                </div>
                <button
                  onClick={onClose}
                  className="p-1 -mr-1 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <p className="text-slate-100 text-sm leading-relaxed mb-4">
                {node.label}
              </p>

              {/* Connected nodes */}
              {connectedNodes.length > 0 && (
                <div>
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-2">
                    Connected
                  </p>
                  <div className="space-y-1.5">
                    {connectedNodes.slice(0, 5).map((cn) => (
                      <div
                        key={cn.id}
                        className="flex items-center gap-2 text-xs text-slate-400"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: CATEGORY_COLORS[cn.category] }}
                        />
                        <span className="truncate">{cn.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
