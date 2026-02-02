'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, Clock, Sparkles, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import type { Milestone } from '@/lib/supabase/types'
import { Button } from '@/components/ui/Button'

interface MilestoneListProps {
  milestones: Milestone[]
  onComplete: (id: string) => Promise<number>
  onAdd?: () => void
  onDelete?: (id: string) => void
  showAddButton?: boolean
  isEditable?: boolean
}

export function MilestoneList({
  milestones,
  onComplete,
  onAdd,
  onDelete,
  showAddButton = false,
  isEditable = false,
}: MilestoneListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [recentXp, setRecentXp] = useState<{ id: string; amount: number } | null>(null)

  const completedCount = milestones.filter(m => m.status === 'completed').length
  const totalCount = milestones.length

  const handleComplete = async (milestone: Milestone) => {
    if (milestone.status === 'completed' || completingId) return

    setCompletingId(milestone.id)

    const xp = await onComplete(milestone.id)

    if (xp > 0) {
      setRecentXp({ id: milestone.id, amount: xp })
      setTimeout(() => setRecentXp(null), 2000)
    }

    setCompletingId(null)
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-white">Milestones</h3>
          <span className="text-sm text-slate-400">
            {completedCount}/{totalCount}
          </span>
        </div>
        {showAddButton && onAdd && (
          <Button variant="ghost" size="sm" onClick={onAdd}>
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        )}
      </div>

      {/* Milestone Items */}
      <div className="space-y-2">
        {milestones.map((milestone, index) => {
          const isCompleted = milestone.status === 'completed'
          const isInProgress = milestone.status === 'in_progress'
          const isExpanded = expandedId === milestone.id
          const isCompleting = completingId === milestone.id
          const showXpGain = recentXp?.id === milestone.id

          return (
            <motion.div
              key={milestone.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`
                rounded-lg border transition-all
                ${isCompleted
                  ? 'bg-teal-500/5 border-teal-500/20'
                  : isInProgress
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : 'bg-slate-800/30 border-slate-700/30'
                }
              `}
            >
              <div
                className="p-3 flex items-start gap-3 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : milestone.id)}
              >
                {/* Status Icon */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleComplete(milestone)
                  }}
                  disabled={isCompleted || isCompleting}
                  className={`
                    flex-shrink-0 mt-0.5 transition-colors
                    ${isCompleted
                      ? 'text-teal-500 cursor-default'
                      : 'text-slate-500 hover:text-teal-400'
                    }
                  `}
                >
                  {isCompleting ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Circle className="w-5 h-5" />
                    </motion.div>
                  ) : isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${isCompleted ? 'text-slate-400 line-through' : 'text-white'}`}>
                      {milestone.title}
                    </span>
                    {isInProgress && (
                      <span className="px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded">
                        In Progress
                      </span>
                    )}
                  </div>

                  {/* XP Badge */}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      {milestone.xp_reward} XP
                    </span>
                    {milestone.due_date && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(milestone.due_date).toLocaleDateString()}
                      </span>
                    )}

                    {/* XP Gain Animation */}
                    <AnimatePresence>
                      {showXpGain && (
                        <motion.span
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="text-xs text-teal-400 font-medium"
                        >
                          +{recentXp.amount} XP!
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Expand/Collapse */}
                <div className="flex items-center gap-2">
                  {isEditable && onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(milestone.id)
                      }}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {milestone.description && (
                    isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )
                  )}
                </div>
              </div>

              {/* Expanded Description */}
              <AnimatePresence>
                {isExpanded && milestone.description && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pl-11 text-sm text-slate-400">
                      {milestone.description}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      {/* Empty State */}
      {milestones.length === 0 && (
        <div className="text-center py-8 text-slate-400">
          <p className="text-sm">No milestones yet</p>
          {showAddButton && onAdd && (
            <Button variant="ghost" size="sm" onClick={onAdd} className="mt-2">
              <Plus className="w-4 h-4 mr-1" />
              Add first milestone
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
