'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Loader2, User, Zap, ArrowLeft, CheckCircle, Target, Circle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import { useMilestoneConversation } from '@/lib/hooks/useMilestoneConversation'
import { createClient } from '@/lib/supabase/client'
import { addDebugLog } from '@/components/ui/ConnectionStatus'
import type { Milestone, Project, MilestoneConversation, MilestoneMessage, MilestoneStep } from '@/lib/supabase/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface MilestoneWithProject extends Milestone {
  project: Project
  allMilestones: Milestone[]
  steps: MilestoneStep[]
}

interface MilestoneModeChatProps {
  userId: string
  milestone: MilestoneWithProject
  initialConversation?: MilestoneConversation | null
  initialMessages?: MilestoneMessage[]
}

const INITIAL_MESSAGE = (milestoneName: string, currentStep?: string) => {
  if (currentStep) {
    return `Let's work on "${milestoneName}".

Your current step is: **${currentStep}**

Ready to tackle this? Tell me what you're thinking, or if you're stuck, share what's blocking you and we'll figure it out together.`
  }
  return `Let's get "${milestoneName}" done.

**What's the very first thing you need to do to make progress on this?**

(If you're not sure, tell me what's making you stuck and we'll figure it out together.)`
}

export function MilestoneModeChat({
  userId,
  milestone,
  initialConversation,
  initialMessages
}: MilestoneModeChatProps) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  const hasInitialData = !!(initialConversation && initialMessages)

  const {
    currentConversation,
    loading: convoLoading,
    addMessage: saveMessage,
    setCurrentDirect,
  } = useMilestoneConversation(userId, milestone.id)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [steps, setSteps] = useState<MilestoneStep[]>(milestone.steps || [])
  const [showSteps, setShowSteps] = useState(true)
  const [celebratingStep, setCelebratingStep] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Calculate step progress
  const completedSteps = steps.filter(s => s.is_completed).length
  const totalSteps = steps.length
  const currentStep = steps.find(s => !s.is_completed)
  const stepsProgress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  // Toggle step completion
  const toggleStep = async (stepId: string) => {
    const step = steps.find(s => s.id === stepId)
    if (!step) return

    const newCompleted = !step.is_completed

    // Optimistic update
    setSteps(prev =>
      prev.map(s =>
        s.id === stepId
          ? { ...s, is_completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
          : s
      )
    )

    // Show celebration if completing
    if (newCompleted) {
      setCelebratingStep(stepId)
      setTimeout(() => setCelebratingStep(null), 1500)
    }

    // Persist to database
    try {
      const { error } = await client
        .from('milestone_steps')
        .update({
          is_completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', stepId)

      if (error) {
        console.error('Error toggling step:', error)
        // Revert on error
        setSteps(prev =>
          prev.map(s =>
            s.id === stepId
              ? { ...s, is_completed: !newCompleted, completed_at: null }
              : s
          )
        )
      }
    } catch (err) {
      console.error('Failed to toggle step:', err)
    }
  }

  // Initialize with server data or create initial message
  useEffect(() => {
    if (initialized) return

    addDebugLog('info', 'MilestoneMode init', `hasData=${hasInitialData}`)

    if (hasInitialData && initialMessages && initialConversation) {
      // Use server-provided data
      if (initialMessages.length > 0) {
        setMessages(initialMessages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })))
      } else {
        // New conversation - show initial message with current step context
        const initialContent = INITIAL_MESSAGE(milestone.title, currentStep?.text)
        setMessages([{
          id: 'initial',
          role: 'assistant',
          content: initialContent,
        }])
        // Save initial message
        saveMessage('assistant', initialContent)
      }
      setCurrentDirect(initialConversation, initialMessages)
      setInitialized(true)
      return
    }

    // Wait for hook to load
    if (convoLoading) return

    // Hook finished loading
    if (currentConversation) {
      if (currentConversation.messages.length > 0) {
        setMessages(currentConversation.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })))
      } else {
        // New conversation with current step context
        const initialContent = INITIAL_MESSAGE(milestone.title, currentStep?.text)
        setMessages([{
          id: 'initial',
          role: 'assistant',
          content: initialContent,
        }])
        saveMessage('assistant', initialContent)
      }
    }
    setInitialized(true)
  }, [initialized, hasInitialData, initialMessages, initialConversation, convoLoading, currentConversation, milestone.title, currentStep?.text, saveMessage, setCurrentDirect])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isLoading) return

    addDebugLog('info', 'Sending message', input.trim().slice(0, 50))

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Save user message
    if (currentConversation) {
      const saved = await saveMessage('user', userMessage.content)
      if (!saved) {
        setSaveError('Message not saved')
        setTimeout(() => setSaveError(null), 3000)
      }
    }

    try {
      addDebugLog('info', 'Calling milestone-mode API')

      // Build project context for the API
      const projectContext = {
        name: milestone.project.name,
        description: milestone.project.description,
        status: milestone.project.status,
        milestones: milestone.allMilestones.map(m => ({
          id: m.id,
          title: m.title,
          status: m.status,
          sort_order: m.sort_order,
        })),
      }

      // Build milestone context with current step info
      const milestoneContext: {
        id: string
        title: string
        description: string | null
        status: string
        currentStep?: {
          text: string
          stepNumber: number
          totalSteps: number
          completedSteps: number
        }
      } = {
        id: milestone.id,
        title: milestone.title,
        description: milestone.description,
        status: milestone.status,
      }

      // Add current step context if we have steps
      if (currentStep && steps.length > 0) {
        const stepNumber = steps.findIndex(s => s.id === currentStep.id) + 1
        milestoneContext.currentStep = {
          text: currentStep.text,
          stepNumber,
          totalSteps: steps.length,
          completedSteps,
        }
      }

      const response = await fetch('/api/milestone-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          milestone: milestoneContext,
          project: projectContext,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        addDebugLog('error', 'API error', `${response.status}: ${errorText}`)
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      addDebugLog('success', 'AI response received')

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
      }

      setMessages(prev => [...prev, assistantMessage])

      // Save assistant message
      if (currentConversation) {
        const saved = await saveMessage('assistant', assistantMessage.content)
        if (!saved) {
          setSaveError('Response not saved')
          setTimeout(() => setSaveError(null), 3000)
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      addDebugLog('error', 'Chat failed', errorMsg)
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `Something went wrong: ${errorMsg}\n\nTap the connection indicator in the top right for debug info.`,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleMarkComplete = async () => {
    try {
      const { error } = await client
        .from('milestones')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', milestone.id)

      if (error) throw error

      // Award XP
      await client.rpc('increment_xp', {
        user_id: userId,
        xp_amount: milestone.xp_reward || 50,
      })

      setShowSuccess(true)
      addDebugLog('success', 'Milestone completed!', milestone.title)
    } catch (err) {
      addDebugLog('error', 'Failed to complete milestone', String(err))
      setSaveError('Failed to mark complete')
      setTimeout(() => setSaveError(null), 3000)
    }
  }

  // Calculate progress
  const completedCount = milestone.allMilestones.filter(m => m.status === 'completed').length
  const totalCount = milestone.allMilestones.length
  const currentIndex = milestone.allMilestones.findIndex(m => m.id === milestone.id) + 1

  if (!initialized || convoLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] gap-4">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
        <p className="text-sm text-slate-500">Loading milestone mode...</p>
      </div>
    )
  }

  // Success overlay
  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] gap-6 px-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center"
        >
          <CheckCircle className="w-12 h-12 text-green-400" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center"
        >
          <h2 className="text-2xl font-bold text-white mb-2">Milestone Complete!</h2>
          <p className="text-slate-400 mb-2">{milestone.title}</p>
          <p className="text-green-400 text-sm">+{milestone.xp_reward || 50} XP</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex gap-3"
        >
          <Link
            href={`/projects/${milestone.project_id}`}
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors"
          >
            Back to Project
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link
            href={`/projects/${milestone.project_id}`}
            className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-orange-400 font-medium">FOCUS MODE</span>
            </div>
            <h1 className="text-white font-medium truncate">{milestone.title}</h1>
          </div>
          <button
            onClick={handleMarkComplete}
            className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-green-400 text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <CheckCircle className="w-4 h-4" />
            Done
          </button>
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{milestone.project.name}</span>
            <span>•</span>
            <span>Milestone {currentIndex} of {totalCount}</span>
            <span>•</span>
            <span>{completedCount} complete</span>
          </div>
        </div>
      </div>

      {/* Steps Panel - The Heart of Focus Mode */}
      {steps.length > 0 && (
        <div className="border-b border-slate-800 bg-slate-900/50">
          {/* Steps Header - Always Visible */}
          <button
            onClick={() => setShowSteps(!showSteps)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${stepsProgress === 100 ? 'bg-green-400' : 'bg-orange-400'}`} />
                <span className="text-sm font-medium text-white">
                  {completedSteps}/{totalSteps} steps
                </span>
              </div>
              {/* Progress Bar */}
              <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stepsProgress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={`h-full ${stepsProgress === 100 ? 'bg-green-400' : 'bg-orange-400'}`}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <span className="text-xs">{showSteps ? 'Hide' : 'Show'}</span>
              {showSteps ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {/* Steps List - Collapsible */}
          <AnimatePresence>
            {showSteps && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 space-y-2">
                  {steps.map((step, index) => {
                    const isCurrentStep = currentStep?.id === step.id
                    const isCelebrating = celebratingStep === step.id

                    return (
                      <motion.button
                        key={step.id}
                        onClick={() => toggleStep(step.id)}
                        className={`
                          w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all
                          ${isCurrentStep && !step.is_completed
                            ? 'bg-orange-500/10 border-2 border-orange-500/30 shadow-lg shadow-orange-500/5'
                            : step.is_completed
                              ? 'bg-slate-800/30 border border-slate-700/30'
                              : 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600'
                          }
                        `}
                        whileTap={{ scale: 0.98 }}
                      >
                        {/* Checkbox */}
                        <div className="mt-0.5 flex-shrink-0">
                          {step.is_completed ? (
                            <motion.div
                              initial={isCelebrating ? { scale: 0 } : { scale: 1 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                              className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"
                            >
                              <CheckCircle className="w-3.5 h-3.5 text-white" />
                            </motion.div>
                          ) : isCurrentStep ? (
                            <div className="w-5 h-5 rounded-full border-2 border-orange-400 flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                            </div>
                          ) : (
                            <Circle className="w-5 h-5 text-slate-500" />
                          )}
                        </div>

                        {/* Step Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isCurrentStep && !step.is_completed && (
                              <span className="text-[10px] font-bold text-orange-400 bg-orange-500/20 px-1.5 py-0.5 rounded">
                                NOW
                              </span>
                            )}
                            <span className={`text-sm ${step.is_completed ? 'text-slate-500 line-through' : 'text-white'}`}>
                              {step.text}
                            </span>
                          </div>
                        </div>

                        {/* Step Number */}
                        <span className={`text-xs ${step.is_completed ? 'text-slate-600' : 'text-slate-500'}`}>
                          {index + 1}
                        </span>
                      </motion.button>
                    )
                  })}

                  {/* Celebration when all steps done */}
                  {stepsProgress === 100 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-center gap-2 py-3 text-green-400"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span className="text-sm font-medium">All steps complete! Ready to mark this milestone done?</span>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Error Toast */}
      <AnimatePresence>
        {saveError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-4 my-2 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400"
          >
            {saveError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`
                  flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                  ${message.role === 'user' ? 'bg-teal-500/20' : 'bg-orange-500/20'}
                `}
              >
                {message.role === 'user' ? (
                  <User className="w-4 h-4 text-teal-400" />
                ) : (
                  <Zap className="w-4 h-4 text-orange-400" />
                )}
              </div>

              <div className="flex-1 max-w-[85%]">
                <div
                  className={`
                    rounded-2xl px-4 py-3
                    ${message.role === 'user'
                      ? 'bg-teal-500/10 border border-teal-500/20'
                      : 'bg-slate-800/50 border border-slate-700/50'
                    }
                  `}
                >
                  {message.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-white whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-orange-400" />
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 p-4 bg-slate-900">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What's your next step?"
            rows={1}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-12 h-12 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Send className="w-5 h-5 text-white" />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
