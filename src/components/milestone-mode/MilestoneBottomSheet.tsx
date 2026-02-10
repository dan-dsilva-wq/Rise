'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useDragControls, PanInfo } from 'framer-motion'
import {
  X, Target, Sparkles, CheckCircle, Loader2,
  Wand2, BookOpen, Send, GripHorizontal, Maximize2, Circle, CheckCircle2, AlertCircle
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import { useMilestoneMode } from '@/lib/hooks/useMilestoneMode'
import type { Milestone, Project } from '@/lib/supabase/types'

interface MilestoneBottomSheetProps {
  milestone: Milestone | null
  project: Project | null
  allMilestones: Milestone[]
  userId: string | undefined
  onClose: () => void
  onComplete: (id: string) => Promise<number>
}

type Mode = 'loading' | 'steps' | 'chat'
const AUTO_DO_IT_KICKOFF_MARKER = '[AUTO_DO_IT_KICKOFF]'

export function MilestoneBottomSheet({
  milestone,
  project,
  allMilestones,
  userId,
  onClose,
  onComplete,
}: MilestoneBottomSheetProps) {
  const {
    steps,
    stepsExist,
    conversation,
    messages,
    loading: dataLoading,
    saveSteps,
    toggleStep,
    getOrCreateConversation,
    addMessage,
    addMessageOptimistic,
    setMessages,
  } = useMilestoneMode({ milestoneId: milestone?.id, userId })

  const [mode, setMode] = useState<Mode>('loading')
  const [generatingSteps, setGeneratingSteps] = useState(false)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const dragControls = useDragControls()

  // Determine initial mode based on data
  useEffect(() => {
    if (dataLoading) {
      setMode('loading')
      return
    }

    // If we have messages, go to chat
    if (messages.length > 0) {
      setMode('chat')
      setExpanded(true)
    }
    // If we have steps (or need to generate), show steps
    else if (stepsExist) {
      setMode('steps')
    }
    // Generate steps if none exist
    else if (milestone && project && !generatingSteps) {
      generateSteps()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataLoading, stepsExist, messages.length, milestone, project])

  // Generate AI steps
  const generateSteps = async () => {
    if (!milestone || !project || generatingSteps) return

    setGeneratingSteps(true)
    setMode('loading')

    try {
      const response = await fetch('/api/milestone-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          milestone: {
            id: milestone.id,
            title: milestone.title,
            description: milestone.description,
            notes: milestone.notes,
          },
          project: {
            name: project.name,
            description: project.description,
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to generate steps')

      const data = await response.json()
      const newSteps = data.steps || []

      // Save to database
      await saveSteps(newSteps)
      setMode('steps')
    } catch (err) {
      console.error('Failed to generate steps:', err)
      // Save default steps
      await saveSteps([
        { text: 'Break down the task into smaller pieces', type: 'action' as const },
        { text: 'Identify any blockers or questions', type: 'decision' as const },
        { text: 'Start with the easiest part first', type: 'action' as const },
      ])
      setMode('steps')
    } finally {
      setGeneratingSteps(false)
    }
  }

  const handleApproachSelect = async (approach: 'do-it' | 'guide') => {
    const convo = await getOrCreateConversation(approach)
    if (!convo) return

    setMode('chat')
    setExpanded(true)

    if (approach === 'do-it' && milestone && project) {
      setIsLoading(true)
      setChatError(null)
      try {
        const response = await fetch('/api/milestone-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: AUTO_DO_IT_KICKOFF_MARKER }],
            milestone: {
              id: milestone.id,
              title: milestone.title,
              description: milestone.description,
              status: milestone.status,
            },
            project: {
              name: project.name,
              description: project.description,
              status: project.status,
              milestones: allMilestones.map(m => ({
                id: m.id,
                title: m.title,
                status: m.status,
                sort_order: m.sort_order,
              })),
            },
            approach: 'do-it',
          }),
        })

        if (!response.ok) throw new Error('Failed to generate kickoff questions')
        const data = await response.json() as { message: string }
        await addMessage('assistant', data.message)
      } catch (err) {
        console.error('Failed to auto-start do-it conversation:', err)
        await addMessage(
          'assistant',
          `Before I execute "${milestone.title}", I need a few details: scope, technical preferences, constraints, and definition of done.`
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    const guideMessage = `I'll guide you through "${milestone?.title}" step by step. I'll explain each part so you understand the process. What's the first thing you'd like to tackle?`
    await addMessage('assistant', guideMessage)
  }

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !milestone || !project || !conversation) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)
    setChatError(null)

    // Add user message optimistically
    addMessageOptimistic('user', userMessage)

    try {
      const response = await fetch('/api/milestone-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }],
          milestone: {
            id: milestone.id,
            title: milestone.title,
            description: milestone.description,
          },
          project: {
            name: project.name,
            description: project.description,
            status: project.status,
            milestones: allMilestones.map(m => ({
              id: m.id,
              title: m.title,
              status: m.status,
              sort_order: m.sort_order,
            })),
          },
          approach: conversation.approach,
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()

      // Save both messages to database
      await addMessage('user', userMessage)
      await addMessage('assistant', data.message)

      // Update messages state (remove temp, add real)
      setMessages(prev => {
        const withoutTemp = prev.filter(m => !m.id.startsWith('temp-'))
        return withoutTemp
      })
    } catch (err) {
      console.error('Chat error:', err)
      // Set error state and restore the user's message for easy retry
      setChatError('Failed to send message. Please try again.')
      setInput(userMessage)
      // Remove the optimistic user message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')))
    } finally {
      setIsLoading(false)
    }
  }

  const handleComplete = async () => {
    if (!milestone) return
    const result = await onComplete(milestone.id)
    if (result > 0) {
      setShowSuccess(true)
    }
  }

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 100) {
      onClose()
    } else if (info.offset.y < -50) {
      setExpanded(true)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  if (!milestone) return null

  const currentIndex = allMilestones.findIndex(m => m.id === milestone.id) + 1
  const completedSteps = steps.filter(s => s.is_completed).length

  // Success overlay — warm celebration
  if (showSuccess) {
    const remaining = allMilestones.filter(m => m.status !== 'completed' && m.id !== milestone.id).length
    const totalDone = allMilestones.filter(m => m.status === 'completed').length + 1
    const isProjectComplete = remaining === 0

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
        onClick={() => { setShowSuccess(false); onClose() }}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          className="bg-slate-900 rounded-t-3xl w-full max-w-lg p-8 text-center"
          onClick={e => e.stopPropagation()}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-4"
          >
            <CheckCircle className="w-10 h-10 text-green-400" />
          </motion.div>
          <h2 className="text-xl font-bold text-white mb-2">
            {isProjectComplete ? 'Project Complete!' : 'Milestone Done!'}
          </h2>
          <p className="text-slate-300 mb-2">{milestone.title}</p>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
            {isProjectComplete
              ? `All ${totalDone} milestones complete. You built something real.`
              : `${totalDone} of ${allMilestones.length} done. Keep the momentum going.`
            }
          </p>
          <button
            onClick={() => { setShowSuccess(false); onClose() }}
            className="mt-6 px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-xl text-white font-medium"
          >
            {isProjectComplete ? 'Nice.' : 'Keep Going'}
          </button>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60"
        onClick={onClose}
      >
        <motion.div
          drag="y"
          dragControls={dragControls}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          initial={{ y: '100%' }}
          animate={{ y: 0, height: expanded ? '90vh' : 'auto' }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-3xl overflow-hidden flex flex-col"
          style={{ maxHeight: expanded ? '90vh' : '70vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag Handle */}
          <div
            className="flex justify-center py-3 cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => dragControls.start(e)}
          >
            <GripHorizontal className="w-8 h-1.5 text-slate-600" />
          </div>

          {/* Header */}
          <div className="px-4 pb-3 border-b border-slate-800 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-teal-400" />
                <span className="text-xs text-teal-400 font-medium uppercase">
                  Milestone {currentIndex} of {allMilestones.length}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-white truncate">{milestone.title}</h2>
              {project && (
                <p className="text-xs text-slate-500 mt-0.5">{project.name}</p>
              )}
            </div>
            <div className="flex gap-2">
              {!expanded && (
                <button
                  onClick={() => setExpanded(true)}
                  className="p-2 text-slate-400 hover:text-slate-200"
                >
                  <Maximize2 className="w-5 h-5" />
                </button>
              )}
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Loading State */}
            {mode === 'loading' && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-teal-400 animate-spin mb-3" />
                <p className="text-slate-400 text-sm">
                  {generatingSteps ? 'Analyzing your milestone...' : 'Loading...'}
                </p>
              </div>
            )}

            {/* Steps View */}
            {mode === 'steps' && (
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      First Steps
                    </span>
                    {steps.length > 0 && (
                      <span className="text-xs text-slate-500">
                        {completedSteps}/{steps.length} done
                      </span>
                    )}
                  </h3>
                  <div className="space-y-2">
                    {steps.map((step, idx) => (
                      <motion.button
                        key={step.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => toggleStep(step.id)}
                        className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left ${
                          step.is_completed
                            ? 'bg-green-500/10 border-green-500/30'
                            : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                        }`}
                      >
                        {step.is_completed ? (
                          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                        )}
                        <span className={`text-sm ${
                          step.is_completed ? 'text-slate-400 line-through' : 'text-slate-300'
                        }`}>
                          {step.text}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Approach Selection */}
                <div className="pt-4 border-t border-slate-800">
                  <p className="text-sm text-slate-400 mb-3">Need help? How would you like to proceed?</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleApproachSelect('do-it')}
                      className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-colors text-left"
                    >
                      <Wand2 className="w-5 h-5 text-purple-400 mb-2" />
                      <p className="font-medium text-white text-sm">Do it for me</p>
                      <p className="text-xs text-slate-400 mt-1">AI gives you the solution</p>
                    </button>
                    <button
                      onClick={() => handleApproachSelect('guide')}
                      className="p-4 rounded-xl border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 transition-colors text-left"
                    >
                      <BookOpen className="w-5 h-5 text-teal-400 mb-2" />
                      <p className="font-medium text-white text-sm">Guide me</p>
                      <p className="text-xs text-slate-400 mt-1">Learn as you go</p>
                    </button>
                  </div>
                </div>

                {/* Quick Complete */}
                <div className="pt-4">
                  <button
                    onClick={handleComplete}
                    className="w-full p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    <span>Already done? Mark complete</span>
                  </button>
                </div>
              </div>
            )}

            {/* Chat View */}
            {mode === 'chat' && (
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((msg, idx) => (
                    <div
                      key={msg.id || idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                          msg.role === 'user'
                            ? 'bg-teal-500/20 border border-teal-500/30'
                            : 'bg-slate-800 border border-slate-700'
                        }`}
                      >
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-white text-sm">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2">
                        <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}
          </div>

          {/* Chat Input (when in chat mode) */}
          {mode === 'chat' && (
            <div className="border-t border-slate-800 p-4 bg-slate-900">
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setMode('steps')}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 text-sm"
                >
                  ← Steps
                </button>
                <button
                  onClick={handleComplete}
                  className="px-3 py-1.5 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  Done
                </button>
                <Link
                  href={`/projects/${project?.id}/milestone/${milestone.id}`}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 text-sm flex items-center gap-1.5"
                >
                  <Maximize2 className="w-4 h-4" />
                  Full screen
                </Link>
              </div>

              {/* Error message */}
              <AnimatePresence>
                {chatError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg"
                  >
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-red-400 text-sm flex-1">{chatError}</p>
                    <button
                      onClick={() => setChatError(null)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                      aria-label="Dismiss error"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.form
                onSubmit={(e) => { e.preventDefault(); handleSendMessage() }}
                className="flex gap-2"
                animate={chatError ? { x: [0, -4, 4, -4, 4, 0] } : {}}
                transition={{ duration: 0.4 }}
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    if (chatError) setChatError(null)
                  }}
                  placeholder="Ask a question..."
                  className={`flex-1 bg-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
                    chatError
                      ? 'border-2 border-red-500/50 focus:ring-red-500'
                      : 'border border-slate-700 focus:ring-teal-500'
                  }`}
                  aria-invalid={!!chatError}
                  aria-describedby={chatError ? 'chat-error' : undefined}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={`w-12 h-12 rounded-xl transition-colors flex items-center justify-center ${
                    chatError && input.trim()
                      ? 'bg-red-500 hover:bg-red-400'
                      : 'bg-teal-500 hover:bg-teal-400 disabled:bg-slate-700'
                  }`}
                  aria-label={chatError ? 'Retry sending message' : 'Send message'}
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              </motion.form>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
