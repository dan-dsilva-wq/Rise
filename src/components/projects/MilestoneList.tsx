'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, Clock, Sparkles, ChevronRight, Plus, Trash2, AlertTriangle } from 'lucide-react'
import type { Milestone } from '@/lib/supabase/types'
import { Button } from '@/components/ui/Button'

interface MilestoneListProps {
  milestones: Milestone[]
  projectId: string
  onComplete: (id: string) => Promise<number>
  onUncomplete?: (id: string) => Promise<number>
  onAdd?: () => void
  onDelete?: (id: string) => void
  showAddButton?: boolean
  isEditable?: boolean
}

export function MilestoneList({
  milestones,
  projectId,
  onComplete,
  onUncomplete,
  onAdd,
  onDelete,
  showAddButton = false,
  isEditable = false,
}: MilestoneListProps) {
  const router = useRouter()
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [recentXp, setRecentXp] = useState<{ id: string; amount: number } | null>(null)
  const [uncompleteConfirm, setUncompleteConfirm] = useState<Milestone | null>(null)
  const [uncompletingId, setUncompletingId] = useState<string | null>(null)

  // Filter out discarded milestones
  const activeMilestones = milestones.filter(m => m.status !== 'discarded')
  const completedCount = activeMilestones.filter(m => m.status === 'completed').length
  const totalCount = activeMilestones.length

  const handleComplete = async (milestone: Milestone) => {
    if (completingId || uncompletingId) return

    // If already completed, show confirmation to uncomplete
    if (milestone.status === 'completed') {
      if (onUncomplete) {
        setUncompleteConfirm(milestone)
      }
      return
    }

    setCompletingId(milestone.id)

    const xp = await onComplete(milestone.id)

    if (xp > 0) {
      setRecentXp({ id: milestone.id, amount: xp })
      setTimeout(() => setRecentXp(null), 2000)
    }

    setCompletingId(null)
  }

  const handleConfirmUncomplete = async () => {
    if (!uncompleteConfirm || !onUncomplete) return

    setUncompletingId(uncompleteConfirm.id)
    setUncompleteConfirm(null)

    const xp = await onUncomplete(uncompleteConfirm.id)

    if (xp > 0) {
      setRecentXp({ id: uncompleteConfirm.id, amount: -xp })
      setTimeout(() => setRecentXp(null), 2000)
    }

    setUncompletingId(null)
  }

  const handleMilestoneClick = (milestone: Milestone) => {
    // Navigate to Milestone Mode for AI assistance
    router.push(`/projects/${projectId}/milestone/${milestone.id}`)
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

      {/* Hint text */}
      {activeMilestones.length > 0 && (
        <p className="text-xs text-slate-500">Tap a milestone to work on it with AI</p>
      )}

      {/* Milestone Items */}
      <div className="space-y-2">
        {activeMilestones.map((milestone, index) => {
          const isCompleted = milestone.status === 'completed'
          const isInProgress = milestone.status === 'in_progress'
          const isCompleting = completingId === milestone.id
          const showXpGain = recentXp?.id === milestone.id

          return (
            <motion.div
              key={milestone.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleMilestoneClick(milestone)}
              className={`
                rounded-lg border transition-all cursor-pointer group
                ${isCompleted
                  ? 'bg-teal-500/5 border-teal-500/20 hover:bg-teal-500/10'
                  : isInProgress
                    ? 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10'
                    : 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-800/50 hover:border-slate-600/50'
                }
              `}
            >
              <div className="p-3 flex items-start gap-3">
                {/* Status Icon - clicking marks complete/uncomplete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleComplete(milestone)
                  }}
                  disabled={isCompleting || uncompletingId === milestone.id}
                  className={`
                    flex-shrink-0 mt-0.5 transition-colors
                    ${isCompleted
                      ? 'text-teal-500 hover:text-teal-300'
                      : 'text-slate-500 hover:text-teal-400'
                    }
                  `}
                  title={isCompleted ? 'Click to mark incomplete' : 'Mark as complete'}
                >
                  {isCompleting || uncompletingId === milestone.id ? (
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
                    <span className={`font-medium ${isCompleted ? 'text-slate-400 line-through' : 'text-white group-hover:text-teal-300'} transition-colors`}>
                      {milestone.title}
                    </span>
                    {isInProgress && (
                      <span className="px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded">
                        In Progress
                      </span>
                    )}
                  </div>

                  {/* Description preview if exists */}
                  {milestone.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                      {milestone.description}
                    </p>
                  )}

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

                {/* Actions & Arrow */}
                <div className="flex items-center gap-1">
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
                  {/* Arrow indicator - shows it's clickable */}
                  <ChevronRight className={`w-5 h-5 transition-all ${isCompleted ? 'text-slate-600' : 'text-slate-500 group-hover:text-teal-400 group-hover:translate-x-0.5'}`} />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Empty State */}
      {activeMilestones.length === 0 && (
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

      {/* Uncomplete Confirmation Modal */}
      <AnimatePresence>
        {uncompleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setUncompleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-sm w-full shadow-xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-full bg-amber-500/20">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Mark as incomplete?</h3>
              </div>

              <p className="text-slate-400 text-sm mb-2">
                Are you sure you want to mark this milestone as incomplete?
              </p>
              <p className="text-slate-500 text-sm mb-5">
                <span className="text-amber-400 font-medium">-{uncompleteConfirm.xp_reward} XP</span> will be deducted from your total.
              </p>

              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setUncompleteConfirm(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/30"
                  onClick={handleConfirmUncomplete}
                >
                  Yes, mark incomplete
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
