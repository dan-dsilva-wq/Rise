'use client'

import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import type { TreeNode, TreeOption } from '@/lib/path-finder/tree-data'

interface NodeProps {
  node: TreeNode
  onSelectOption: (option: TreeOption) => void
  isActive?: boolean
}

export function Node({ node, onSelectOption, isActive = true }: NodeProps) {
  if (node.type === 'suggestion') {
    return null // Suggestions are handled by PathSuggestion component
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full"
    >
      {/* Question Header */}
      <div className="text-center mb-6">
        {node.emoji && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-4xl mb-3 block"
          >
            {node.emoji}
          </motion.span>
        )}
        <h2 className="text-2xl font-bold text-white mb-2">{node.title}</h2>
        {node.description && (
          <p className="text-slate-400 text-sm">{node.description}</p>
        )}
      </div>

      {/* Options */}
      <div className="space-y-3">
        {node.options?.map((option, index) => (
          <motion.button
            key={option.nextNodeId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectOption(option)}
            disabled={!isActive}
            className={`
              w-full p-4 rounded-xl text-left
              bg-slate-800/50 border border-slate-700/50
              hover:bg-slate-700/50 hover:border-teal-500/50
              transition-all duration-200
              ${!isActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              group
            `}
          >
            <div className="flex items-center gap-3">
              {option.emoji && (
                <span className="text-2xl flex-shrink-0">{option.emoji}</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white group-hover:text-teal-400 transition-colors">
                  {option.label}
                </div>
                {option.description && (
                  <div className="text-sm text-slate-400 mt-0.5 truncate">
                    {option.description}
                  </div>
                )}
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-teal-400 transition-colors flex-shrink-0" />
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
