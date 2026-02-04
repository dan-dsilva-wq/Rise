'use client'

import { useId } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import type { TreeNode, TreeOption } from '@/lib/path-finder/tree-data'

interface NodeProps {
  node: TreeNode
  onSelectOption: (option: TreeOption) => void
  isActive?: boolean
}

export function Node({ node, onSelectOption, isActive = true }: NodeProps) {
  const questionId = useId()
  const descriptionId = useId()

  if (node.type === 'suggestion') {
    return null // Suggestions are handled by PathSuggestion component
  }

  const hasDescription = !!node.description

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full"
      role="region"
      aria-labelledby={questionId}
    >
      {/* Question Header */}
      <div className="text-center mb-6">
        {node.emoji && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-4xl mb-3 block"
            aria-hidden="true"
          >
            {node.emoji}
          </motion.span>
        )}
        <h2 id={questionId} className="text-2xl font-bold text-white mb-2">
          {node.title}
        </h2>
        {node.description && (
          <p id={descriptionId} className="text-slate-400 text-sm">
            {node.description}
          </p>
        )}
      </div>

      {/* Options */}
      <div
        className="space-y-3"
        role="group"
        aria-label={`Options for: ${node.title}`}
      >
        {node.options?.map((option, index) => (
          <motion.button
            key={option.nextNodeId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={isActive ? { scale: 1.02 } : undefined}
            whileTap={isActive ? { scale: 0.98 } : undefined}
            onClick={() => onSelectOption(option)}
            disabled={!isActive}
            aria-disabled={!isActive}
            aria-describedby={hasDescription ? descriptionId : undefined}
            aria-label={`${option.label}${option.description ? `: ${option.description}` : ''}`}
            className={`
              w-full p-4 rounded-xl text-left
              bg-slate-800/50 border border-slate-700/50
              hover:bg-slate-700/50 hover:border-teal-500/50
              focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-900
              transition-all duration-200
              ${!isActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              group
            `}
          >
            <div className="flex items-center gap-3">
              {option.emoji && (
                <span className="text-2xl flex-shrink-0" aria-hidden="true">
                  {option.emoji}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white group-hover:text-teal-400 group-focus:text-teal-400 transition-colors">
                  {option.label}
                </div>
                {option.description && (
                  <div className="text-sm text-slate-400 mt-0.5 truncate">
                    {option.description}
                  </div>
                )}
              </div>
              <ChevronRight
                className="w-5 h-5 text-slate-500 group-hover:text-teal-400 group-focus:text-teal-400 transition-colors flex-shrink-0"
                aria-hidden="true"
              />
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
