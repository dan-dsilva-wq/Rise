'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, ArrowRight, Clock, DollarSign, Lightbulb, Rocket, ChevronLeft } from 'lucide-react'
import type { TreeNode } from '@/lib/path-finder/tree-data'
import { Button } from '@/components/ui/Button'

interface PathSuggestionProps {
  node: TreeNode
  onStartProject: () => void
  onGoBack: () => void
  isLoading?: boolean
}

export function PathSuggestion({ node, onStartProject, onGoBack, isLoading }: PathSuggestionProps) {
  if (node.type !== 'suggestion' || !node.suggestion) {
    return null
  }

  const suggestion = node.suggestion

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full space-y-6"
    >
      {/* Header */}
      <div className="text-center">
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-5xl mb-4 block"
        >
          {node.emoji}
        </motion.span>
        <h2 className="text-2xl font-bold text-white mb-1">{suggestion.name}</h2>
        <p className="text-teal-400 font-medium">{suggestion.tagline}</p>
      </div>

      {/* Description */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <p className="text-slate-300 leading-relaxed">{suggestion.description}</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <Clock className="w-3.5 h-3.5" />
            Time to MVP
          </div>
          <div className="text-white font-medium">{suggestion.timeToMvp}</div>
        </div>
        <div className="bg-slate-800/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <DollarSign className="w-3.5 h-3.5" />
            Income Model
          </div>
          <div className="text-white font-medium text-sm">{suggestion.incomeModel}</div>
        </div>
      </div>

      {/* Why It Works */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center gap-2 text-teal-400 font-medium mb-3">
          <Lightbulb className="w-4 h-4" />
          Why This Works For You
        </div>
        <ul className="space-y-2">
          {suggestion.whyItWorks.map((reason, index) => (
            <motion.li
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-start gap-2 text-sm text-slate-300"
            >
              <CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" />
              {reason}
            </motion.li>
          ))}
        </ul>
      </div>

      {/* Examples */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="text-slate-400 text-sm font-medium mb-3">Example Ideas</div>
        <div className="flex flex-wrap gap-2">
          {suggestion.examples.map((example, index) => (
            <span
              key={index}
              className="px-3 py-1 bg-slate-700/50 rounded-full text-sm text-slate-300"
            >
              {example}
            </span>
          ))}
        </div>
      </div>

      {/* First Steps */}
      <div className="bg-gradient-to-br from-teal-900/30 to-slate-800/50 border border-teal-700/30 rounded-xl p-4">
        <div className="flex items-center gap-2 text-teal-400 font-medium mb-3">
          <Rocket className="w-4 h-4" />
          First Steps
        </div>
        <ol className="space-y-2">
          {suggestion.firstSteps.map((step, index) => (
            <li key={index} className="flex items-start gap-3 text-sm text-slate-300">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 text-xs font-medium flex items-center justify-center">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button
          variant="ghost"
          size="md"
          onClick={onGoBack}
          className="flex-1"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={onStartProject}
          isLoading={isLoading}
          className="flex-[2]"
        >
          Start This Project
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </motion.div>
  )
}
