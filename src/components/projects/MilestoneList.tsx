'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, Circle, Sparkles, ChevronRight, Plus, Trash2,
  AlertTriangle, Lightbulb, ArrowUp, ChevronDown, Play, Clock,
  Target, ListTodo
} from 'lucide-react'
import type { Milestone, Project } from '@/lib/supabase/types'
import { Button } from '@/components/ui/Button'
import { MilestoneBottomSheet } from '@/components/milestone-mode/MilestoneBottomSheet'

interface MilestoneListProps {
  milestones: Milestone[]
  projectId: string
  project?: Project | null
  userId?: string
  onComplete: (id: string) => Promise<number>
  onUncomplete?: (id: string) => Promise<number>
  onSetFocus?: (id: string, level: 'active' | 'next' | 'backlog') => Promise<boolean>
  onPromote?: (id: string) => Promise<boolean>
  onAdd?: () => void
  onAddIdea?: () => void
  onDelete?: (id: string) => void
  showAddButton?: boolean
  isEditable?: boolean
  useBottomSheet?: boolean  // New: use bottom sheet instead of navigation
}

export function MilestoneList({
  milestones,
  projectId,
  project,
  userId,
  onComplete,
  onUncomplete,
  onSetFocus,
  onPromote,
  onAdd,
  onAddIdea,
  onDelete,
  showAddButton = false,
  isEditable = false,
  useBottomSheet = false,
}: MilestoneListProps) {
  const router = useRouter()
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [recentXp, setRecentXp] = useState<{ id: string; amount: number } | null>(null)
  const [uncompleteConfirm, setUncompleteConfirm] = useState<Milestone | null>(null)
  const [uncompletingId, setUncompletingId] = useState<string | null>(null)
  const [showBacklog, setShowBacklog] = useState(false)
  const [showIdeas, setShowIdeas] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null)

  // Categorize milestones
  const activeMilestone = milestones.find(m => m.focus_level === 'active' && m.status !== 'completed' && m.status !== 'discarded' && m.status !== 'idea')
  const upNext = milestones.filter(m => m.focus_level === 'next' && m.status !== 'completed' && m.status !== 'discarded' && m.status !== 'idea')
  const backlog = milestones.filter(m => (m.focus_level === 'backlog' || !m.focus_level) && m.status !== 'completed' && m.status !== 'discarded' && m.status !== 'idea')
  const ideas = milestones.filter(m => m.status === 'idea')
  const completed = milestones.filter(m => m.status === 'completed')

  const handleComplete = async (milestone: Milestone) => {
    if (completingId || uncompletingId) return

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
    if (useBottomSheet && project) {
      setSelectedMilestone(milestone)
    } else {
      router.push(`/projects/${projectId}/milestone/${milestone.id}`)
    }
  }

  const handleBottomSheetComplete = async (id: string) => {
    const xp = await onComplete(id)
    if (xp > 0) {
      setRecentXp({ id, amount: xp })
      setTimeout(() => setRecentXp(null), 2000)
    }
    return xp
  }

  const handleSetActive = async (milestone: Milestone) => {
    if (onSetFocus) {
      await onSetFocus(milestone.id, 'active')
    }
  }

  const handleMoveToNext = async (milestone: Milestone) => {
    if (onSetFocus && upNext.length < 3) {
      await onSetFocus(milestone.id, 'next')
    }
  }

  const handleMoveToBacklog = async (milestone: Milestone) => {
    if (onSetFocus) {
      await onSetFocus(milestone.id, 'backlog')
    }
  }

  // Compact milestone row
  const MilestoneRow = ({ milestone, showSetActive = false, showMoveToNext = false, showMoveToBacklog = false }: {
    milestone: Milestone
    showSetActive?: boolean
    showMoveToNext?: boolean
    showMoveToBacklog?: boolean
  }) => {
    const isCompleting = completingId === milestone.id
    const isUncompleting = uncompletingId === milestone.id
    const isCompleted = milestone.status === 'completed'
    const showXpGain = recentXp?.id === milestone.id

    return (
      <div
        className={`
          rounded-lg border transition-all cursor-pointer group
          ${isCompleted
            ? 'bg-teal-500/5 border-teal-500/20'
            : 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-800/50 hover:border-slate-600/50'
          }
        `}
      >
        <div className="p-3 flex items-center gap-2">
          {/* Checkbox - min 44x44px touch target for accessibility */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleComplete(milestone)
            }}
            disabled={isCompleting || isUncompleting}
            aria-label={isCompleted ? `Mark "${milestone.title}" as incomplete` : `Mark "${milestone.title}" as complete`}
            className={`flex-shrink-0 min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center transition-colors ${isCompleted ? 'text-teal-500' : 'text-slate-500 hover:text-teal-400'}`}
          >
            {isCompleting || isUncompleting ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                <Circle className="w-5 h-5" />
              </motion.div>
            ) : isCompleted ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <Circle className="w-5 h-5" />
            )}
          </button>

          {/* Title - click to open */}
          <div className="flex-1 min-w-0" onClick={() => handleMilestoneClick(milestone)}>
            <span className={`text-sm ${isCompleted ? 'text-slate-400 line-through' : 'text-white group-hover:text-teal-300'} transition-colors line-clamp-1`}>
              {milestone.title.length > 60 ? milestone.title.slice(0, 60) + '...' : milestone.title}
            </span>
          </div>

          {/* XP animation */}
          <AnimatePresence>
            {showXpGain && (
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="text-xs text-teal-400 font-medium"
              >
                {recentXp!.amount > 0 ? '+' : ''}{recentXp!.amount} XP
              </motion.span>
            )}
          </AnimatePresence>

          {/* Actions - min 44x44px touch targets for mobile accessibility */}
          <div className="flex items-center -mr-2">
            {showSetActive && onSetFocus && (
              <motion.button
                onClick={(e) => { e.stopPropagation(); handleSetActive(milestone) }}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-teal-400 active:text-teal-400 transition-colors"
                title="Set as active"
                aria-label={`Set "${milestone.title}" as active milestone`}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <Play className="w-4 h-4" />
              </motion.button>
            )}
            {showMoveToNext && onSetFocus && upNext.length < 3 && (
              <motion.button
                onClick={(e) => { e.stopPropagation(); handleMoveToNext(milestone) }}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-amber-400 active:text-amber-400 transition-colors"
                title="Move to Up Next"
                aria-label={`Move "${milestone.title}" to Up Next`}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <ArrowUp className="w-4 h-4" />
              </motion.button>
            )}
            {showMoveToBacklog && onSetFocus && (
              <motion.button
                onClick={(e) => { e.stopPropagation(); handleMoveToBacklog(milestone) }}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-300 active:text-slate-300 transition-colors"
                title="Move to Backlog"
                aria-label={`Move "${milestone.title}" to Backlog`}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <ChevronDown className="w-4 h-4" />
              </motion.button>
            )}
            {isEditable && onDelete && (
              <motion.button
                onClick={(e) => { e.stopPropagation(); onDelete(milestone.id) }}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-red-400 active:text-red-400 transition-colors"
                aria-label={`Delete "${milestone.title}"`}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <Trash2 className="w-4 h-4" />
              </motion.button>
            )}
          </div>

          <ChevronRight
            onClick={() => handleMilestoneClick(milestone)}
            className="w-4 h-4 text-slate-600 group-hover:text-slate-400 flex-shrink-0"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ACTIVE - The ONE thing */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-teal-400" />
          <h3 className="text-sm font-medium text-teal-400">Active</h3>
        </div>

        {activeMilestone ? (
          <div
            onClick={() => handleMilestoneClick(activeMilestone)}
            className="rounded-xl border-2 border-teal-500/30 bg-gradient-to-br from-teal-500/10 to-slate-800/50 p-4 cursor-pointer hover:border-teal-500/50 transition-all group"
          >
            <div className="flex items-start gap-1">
              {/* Checkbox - min 44x44px touch target for accessibility */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleComplete(activeMilestone)
                }}
                disabled={completingId === activeMilestone.id}
                aria-label={`Mark "${activeMilestone.title}" as complete`}
                className="flex-shrink-0 min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center text-teal-400 hover:text-teal-300 transition-colors"
              >
                {completingId === activeMilestone.id ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                    <Circle className="w-6 h-6" />
                  </motion.div>
                ) : (
                  <Circle className="w-6 h-6" />
                )}
              </button>
              <div className="flex-1">
                <p className="text-white font-medium group-hover:text-teal-300 transition-colors">
                  {activeMilestone.title}
                </p>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {activeMilestone.xp_reward} XP on completion
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-teal-500/50 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center">
            <p className="text-sm text-slate-500">No active milestone</p>
            {backlog.length > 0 && (
              <p className="text-xs text-slate-600 mt-1">Pick one from backlog to start</p>
            )}
          </div>
        )}
      </div>

      {/* UP NEXT - 2-3 max */}
      {(upNext.length > 0 || (isEditable && backlog.length > 0)) && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-medium text-amber-400">Up Next</h3>
            <span className="text-xs text-slate-500">({upNext.length}/3)</span>
          </div>

          {upNext.length > 0 ? (
            <div className="space-y-2">
              {upNext.map(milestone => (
                <MilestoneRow
                  key={milestone.id}
                  milestone={milestone}
                  showSetActive
                  showMoveToBacklog
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-600 pl-6">Queue up what&apos;s next from backlog</p>
          )}
        </div>
      )}

      {/* BACKLOG - Collapsed */}
      {backlog.length > 0 && (
        <div>
          <motion.button
            onClick={() => setShowBacklog(!showBacklog)}
            aria-expanded={showBacklog}
            aria-controls="backlog-section"
            className="flex items-center gap-2 w-full text-left py-1.5 px-2 -mx-2 rounded-lg transition-colors hover:bg-slate-700/30 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:ring-offset-2 focus:ring-offset-slate-900 group"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <ListTodo className="w-4 h-4 text-slate-500 group-hover:text-slate-400 transition-colors" />
            <span className="text-sm font-medium text-slate-400 group-hover:text-slate-300 transition-colors">
              Backlog ({backlog.length})
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-600 group-hover:text-slate-500 transition-all ${showBacklog ? 'rotate-180' : ''}`} />
          </motion.button>

          <AnimatePresence>
            {showBacklog && (
              <motion.div
                id="backlog-section"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 mt-2 pl-6">
                  {backlog.map(milestone => (
                    <MilestoneRow
                      key={milestone.id}
                      milestone={milestone}
                      showSetActive
                      showMoveToNext={upNext.length < 3}
                    />
                  ))}
                  {showAddButton && onAdd && (
                    <Button variant="ghost" size="sm" onClick={onAdd} className="text-slate-500">
                      <Plus className="w-4 h-4 mr-1" />
                      Add milestone
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* IDEAS - Collapsed */}
      {ideas.length > 0 && (
        <div className="pt-2 border-t border-slate-800">
          <motion.button
            onClick={() => setShowIdeas(!showIdeas)}
            aria-expanded={showIdeas}
            aria-controls="ideas-section"
            className="flex items-center gap-2 w-full text-left py-1.5 px-2 -mx-2 rounded-lg transition-colors hover:bg-yellow-500/10 focus:outline-none focus:ring-2 focus:ring-yellow-500/40 focus:ring-offset-2 focus:ring-offset-slate-900 group"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <Lightbulb className="w-4 h-4 text-yellow-400 group-hover:text-yellow-300 transition-colors" />
            <span className="text-sm font-medium text-yellow-400/70 group-hover:text-yellow-400 transition-colors">
              Ideas ({ideas.length})
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-600 group-hover:text-yellow-500/50 transition-all ${showIdeas ? 'rotate-180' : ''}`} />
          </motion.button>

          <AnimatePresence>
            {showIdeas && (
              <motion.div
                id="ideas-section"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 mt-2 pl-6">
                  {ideas.map(idea => (
                    <div
                      key={idea.id}
                      className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-2 pr-0 flex items-center gap-2 group"
                    >
                      <Lightbulb className="w-4 h-4 text-yellow-400/50 flex-shrink-0" />
                      <span className="text-sm text-slate-400 flex-1">{idea.title}</span>
                      {/* Action buttons with min 44x44px touch targets */}
                      <div className="flex items-center -mr-1">
                        {onPromote && (
                          <motion.button
                            onClick={() => onPromote(idea.id)}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-yellow-400/50 hover:text-teal-400 active:text-teal-400 transition-colors"
                            title="Promote to milestone"
                            aria-label={`Promote "${idea.title}" to milestone`}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <ArrowUp className="w-4 h-4" />
                          </motion.button>
                        )}
                        {isEditable && onDelete && (
                          <motion.button
                            onClick={() => onDelete(idea.id)}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 hover:text-red-400 active:text-red-400 transition-colors"
                            aria-label={`Delete idea "${idea.title}"`}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </motion.button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* COMPLETED - Collapsed */}
      {completed.length > 0 && (
        <div className="pt-2 border-t border-slate-800">
          <motion.button
            onClick={() => setShowCompleted(!showCompleted)}
            aria-expanded={showCompleted}
            aria-controls="completed-section"
            className="flex items-center gap-2 w-full text-left py-1.5 px-2 -mx-2 rounded-lg transition-colors hover:bg-slate-700/30 focus:outline-none focus:ring-2 focus:ring-slate-500/40 focus:ring-offset-2 focus:ring-offset-slate-900 group"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <CheckCircle2 className="w-4 h-4 text-slate-600 group-hover:text-slate-500 transition-colors" />
            <span className="text-sm font-medium text-slate-500 group-hover:text-slate-400 transition-colors">
              Completed ({completed.length})
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-600 group-hover:text-slate-500 transition-all ${showCompleted ? 'rotate-180' : ''}`} />
          </motion.button>

          <AnimatePresence>
            {showCompleted && (
              <motion.div
                id="completed-section"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 mt-2 pl-6">
                  {completed.map(milestone => (
                    <MilestoneRow key={milestone.id} milestone={milestone} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Empty state */}
      {milestones.filter(m => m.status !== 'discarded').length === 0 && (
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

      {/* Add buttons when not empty */}
      {milestones.length > 0 && isEditable && !showBacklog && (
        <div className="flex gap-2 pt-2">
          {onAdd && (
            <Button variant="ghost" size="sm" onClick={onAdd} className="text-slate-500">
              <Plus className="w-4 h-4 mr-1" />
              Milestone
            </Button>
          )}
          {onAddIdea && (
            <Button variant="ghost" size="sm" onClick={onAddIdea} className="text-yellow-500/70">
              <Lightbulb className="w-4 h-4 mr-1" />
              Idea
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
                This will deduct <span className="text-amber-400 font-medium">{uncompleteConfirm.xp_reward} XP</span> from your total.
              </p>

              <div className="flex gap-3 mt-4">
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
                  Yes, undo
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Milestone Bottom Sheet */}
      {useBottomSheet && (
        <AnimatePresence>
          {selectedMilestone && (
            <MilestoneBottomSheet
              milestone={selectedMilestone}
              project={project || null}
              allMilestones={milestones}
              userId={userId}
              onClose={() => setSelectedMilestone(null)}
              onComplete={handleBottomSheetComplete}
            />
          )}
        </AnimatePresence>
      )}
    </div>
  )
}
