'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Loader2, User, Zap, ArrowLeft, CheckCircle, Target, Circle, ChevronDown, ChevronUp, Sparkles, Compass, AlertCircle, RotateCcw, Copy } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import { useMilestoneConversation } from '@/lib/hooks/useMilestoneConversation'
import { useVoiceConversation } from '@/lib/hooks/useVoiceConversation'
import { createClient } from '@/lib/supabase/client'
import { addDebugLog } from '@/components/ui/ConnectionStatus'
import { rebalanceMilestoneFocusPipeline } from '@/lib/milestones/focusPipeline'
import { VoiceControls } from '@/components/voice/VoiceControls'
import type { MilestoneStep } from '@/lib/supabase/types'
import type { OrchestrationDispatchRecord, OrchestrationDispatchStatus } from '@/types/orchestration'
import { AUTO_DO_IT_KICKOFF_MARKER, buildInitialMessage } from './chat-constants'
import type { Approach, Message, MilestoneAction, MilestoneModeChatProps } from './types'

export function MilestoneModeChat({
  userId,
  milestone,
  initialConversation,
  initialMessages,
  initialApproach = 'guide',
  contextualOpener,
  contextualQuickPrompts,
}: MilestoneModeChatProps) {
  const supabase = useMemo(() => createClient(), [])
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
  const [approach, setApproach] = useState<Approach>(initialApproach)
  const [initialized, setInitialized] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [dispatchHistoryOpen, setDispatchHistoryOpen] = useState(false)
  const [dispatches, setDispatches] = useState<OrchestrationDispatchRecord[]>([])
  const [steps, setSteps] = useState<MilestoneStep[]>(milestone.steps || [])
  const [showSteps, setShowSteps] = useState(true)
  const [celebratingStep, setCelebratingStep] = useState<string | null>(null)
  const [autoFocusedStepId, setAutoFocusedStepId] = useState<string | null>(null)
  const [doItKickoffTriggered, setDoItKickoffTriggered] = useState(false)
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null)
  const {
    isRecording,
    isTranscribing,
    isSpeaking,
    isMuted,
    voiceError,
    toggleRecordingAndTranscribe,
    toggleMute,
    clearVoiceError,
    speakText,
  } = useVoiceConversation()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stepRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Calculate step progress
  const completedSteps = steps.filter(s => s.is_completed).length
  const totalSteps = steps.length
  const currentStep = steps.find(s => !s.is_completed)
  const stepsProgress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
  const pendingDispatchCount = dispatches.filter(dispatch => dispatch.status === 'pending').length

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
        if (initialMessages.some(m => m.role === 'user')) {
          setDoItKickoffTriggered(true)
        }
      } else {
        if (initialApproach === 'do-it') {
          // Let do-it mode generate the first assistant message proactively.
          setMessages([])
        } else {
          // New conversation - use contextual opener if available, fall back to static template
          const initialContent = contextualOpener || buildInitialMessage(milestone.title, currentStep?.text)
          setMessages([{
            id: 'initial',
            role: 'assistant',
            content: initialContent,
          }])
          // Save initial message
          saveMessage('assistant', initialContent)
        }
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
        if (currentConversation.messages.some(m => m.role === 'user')) {
          setDoItKickoffTriggered(true)
        }
      } else {
        if (initialApproach === 'do-it') {
          // Let do-it mode generate the first assistant message proactively.
          setMessages([])
        } else {
          // New conversation - use contextual opener if available, fall back to static template
          const initialContent = contextualOpener || buildInitialMessage(milestone.title, currentStep?.text)
          setMessages([{
            id: 'initial',
            role: 'assistant',
            content: initialContent,
          }])
          saveMessage('assistant', initialContent)
        }
      }
    }
    setInitialized(true)
  }, [initialized, hasInitialData, initialMessages, initialConversation, convoLoading, currentConversation, milestone.title, currentStep?.text, contextualOpener, saveMessage, setCurrentDirect, initialApproach])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const fetchDispatches = async () => {
      try {
        const params = new URLSearchParams({
          projectId: milestone.project_id,
          milestoneId: milestone.id,
        })
        const response = await fetch(`/api/orchestration/dispatch?${params.toString()}`)
        if (!response.ok) return
        const data = await response.json() as { dispatches?: OrchestrationDispatchRecord[] }
        setDispatches(data.dispatches || [])
      } catch (error) {
        console.error('Failed to fetch dispatch history:', error)
      }
    }

    void fetchDispatches()
  }, [milestone.project_id, milestone.id])

  const conversationId = currentConversation?.id

  useEffect(() => {
    if (!conversationId) return
    client
      .from('milestone_conversations')
      .update({ approach, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .then(() => {})
  }, [approach, conversationId, client])

  const showTransientNotice = useCallback((text: string, ms = 4500) => {
    setActionNotice(text)
    setTimeout(() => setActionNotice(null), ms)
  }, [])

  const buildProjectContext = useCallback(() => ({
    name: milestone.project.name,
    description: milestone.project.description,
    status: milestone.project.status,
    milestones: milestone.allMilestones.map(m => ({
      id: m.id,
      title: m.title,
      status: m.status,
      sort_order: m.sort_order,
    })),
  }), [milestone.project.name, milestone.project.description, milestone.project.status, milestone.allMilestones])

  const buildMilestoneContext = useCallback(() => {
    const context: {
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

    if (currentStep && steps.length > 0) {
      const stepNumber = steps.findIndex(s => s.id === currentStep.id) + 1
      context.currentStep = {
        text: currentStep.text,
        stepNumber,
        totalSteps: steps.length,
        completedSteps,
      }
    }

    return context
  }, [milestone.id, milestone.title, milestone.description, milestone.status, currentStep, steps, completedSteps])

  const markMilestoneComplete = useCallback(async () => {
    const { error } = await client
      .from('milestones')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', milestone.id)

    if (error) throw error

    await rebalanceMilestoneFocusPipeline(client, milestone.project_id)
  }, [client, milestone.id, milestone.project_id])

  const applyMilestoneActions = useCallback(async (actions?: MilestoneAction[]) => {
    if (!actions || actions.length === 0) return

    const now = new Date().toISOString()
    const nextSteps = [...steps]
    let completedByTagCount = 0
    let completedMilestoneByTag = false

    for (const action of actions) {
      if (action.type === 'complete_step') {
        const normalizedStepText = action.stepText?.trim().toLowerCase()
        let targetIndex = -1

        if (action.stepId) {
          targetIndex = nextSteps.findIndex(step => step.id === action.stepId)
        }

        if (targetIndex === -1 && action.stepNumber && action.stepNumber > 0) {
          const index = action.stepNumber - 1
          if (index >= 0 && index < nextSteps.length) targetIndex = index
        }

        if (targetIndex === -1 && normalizedStepText) {
          targetIndex = nextSteps.findIndex(
            step => step.text.trim().toLowerCase() === normalizedStepText
          )
        }

        if (targetIndex === -1 && normalizedStepText) {
          targetIndex = nextSteps.findIndex(step => step.text.trim().toLowerCase().includes(normalizedStepText))
        }

        if (targetIndex === -1) {
          targetIndex = nextSteps.findIndex(step => !step.is_completed)
        }

        if (targetIndex === -1) continue

        const step = nextSteps[targetIndex]
        if (step.is_completed) continue

        nextSteps[targetIndex] = {
          ...step,
          is_completed: true,
          completed_at: now,
          updated_at: now,
        }

        const { error } = await client
          .from('milestone_steps')
          .update({
            is_completed: true,
            completed_at: now,
            updated_at: now,
          })
          .eq('id', step.id)

        if (error) {
          console.error('Failed to complete step from AI action:', error)
          continue
        }

        completedByTagCount += 1
      }

      if (action.type === 'complete_milestone') {
        const requestedMilestoneId = action.milestoneId || milestone.id
        if (requestedMilestoneId !== milestone.id) continue

        try {
          await markMilestoneComplete()
          completedMilestoneByTag = true
        } catch (error) {
          console.error('Failed to complete milestone from AI action:', error)
        }
      }
    }

    if (completedByTagCount > 0) {
      setSteps(nextSteps)
      const nextIncomplete = nextSteps.find(step => !step.is_completed)

      if (nextIncomplete) {
        setAutoFocusedStepId(nextIncomplete.id)
        setShowSteps(true)
        setTimeout(() => {
          stepRefs.current[nextIncomplete.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 150)
        setTimeout(() => setAutoFocusedStepId(null), 4000)
        showTransientNotice(`Marked ${completedByTagCount} step${completedByTagCount === 1 ? '' : 's'} complete. Next step is highlighted.`)
      } else {
        showTransientNotice(`Marked ${completedByTagCount} step${completedByTagCount === 1 ? '' : 's'} complete.`)
      }
    }

    if (completedMilestoneByTag) {
      addDebugLog('success', 'Milestone completed by AI action', milestone.title)
      setShowSuccess(true)
      showTransientNotice('Milestone marked complete and focus pipeline updated.')
    }
  }, [steps, milestone.id, milestone.title, client, markMilestoneComplete, showTransientNotice])

  useEffect(() => {
    const hasUserMessage = messages.some(message => message.role === 'user')
    if (hasUserMessage) {
      setDoItKickoffTriggered(true)
      return
    }

    if (!initialized || convoLoading || isLoading) return
    if (approach !== 'do-it') return
    if (doItKickoffTriggered) return

    setDoItKickoffTriggered(true)

    const kickoff = async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/api/milestone-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: AUTO_DO_IT_KICKOFF_MARKER }],
            milestone: buildMilestoneContext(),
            project: buildProjectContext(),
            approach: 'do-it',
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || `Kickoff failed (${response.status})`)
        }

        const data = await response.json() as { message: string; actions?: MilestoneAction[] }
        const kickoffMessage: Message = {
          id: `assistant-kickoff-${Date.now()}`,
          role: 'assistant',
          content: data.message,
        }

        setMessages(prev => {
          if (prev.length === 1 && prev[0].role === 'assistant' && prev[0].id === 'initial') {
            return [kickoffMessage]
          }
          return [...prev, kickoffMessage]
        })
        void speakText(kickoffMessage.content)

        if (currentConversation) {
          await saveMessage('assistant', kickoffMessage.content)
        }

        await applyMilestoneActions(data.actions)
      } catch (error) {
        console.error('Do-it kickoff failed:', error)
        showTransientNotice('Could not auto-start do-it mode. Send a message to continue.', 5000)
      } finally {
        setIsLoading(false)
      }
    }

    void kickoff()
  }, [
    approach,
    initialized,
    convoLoading,
    isLoading,
    doItKickoffTriggered,
    messages,
    currentConversation,
    saveMessage,
    applyMilestoneActions,
    buildMilestoneContext,
    buildProjectContext,
    showTransientNotice,
    speakText,
  ])

  const handleCopyDispatchPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
      setDispatchNotice('Dispatch prompt copied to clipboard.')
      setTimeout(() => setDispatchNotice(null), 3500)
    } catch (error) {
      console.error('Failed to copy dispatch prompt:', error)
      setSaveError('Failed to copy prompt')
      setTimeout(() => setSaveError(null), 3000)
    }
  }

  const handleDispatchToClaude = async () => {
    if (dispatching) return

    setDispatching(true)
    setDispatchNotice(null)

    const currentStepIndex = currentStep ? steps.findIndex(step => step.id === currentStep.id) : 0

    try {
      const response = await fetch('/api/orchestration/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: milestone.project_id,
          milestoneId: milestone.id,
          stepIndex: currentStepIndex >= 0 ? currentStepIndex : 0,
        }),
      })

      const data = await response.json() as {
        error?: string
        prompt?: string
        dispatch?: OrchestrationDispatchRecord
      }

      if (!response.ok) {
        throw new Error(data.error || `Failed to dispatch (${response.status})`)
      }

      if (!data.prompt) {
        throw new Error('Dispatch generated no prompt')
      }

      await navigator.clipboard.writeText(data.prompt)
      setDispatchNotice('Claude Code prompt copied. Paste it into Claude Code to execute.')
      setTimeout(() => setDispatchNotice(null), 4500)

      if (data.dispatch) {
        const createdDispatch = data.dispatch
        setDispatches(prev => [createdDispatch, ...prev])
      }
    } catch (error) {
      console.error('Failed to dispatch orchestration task:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to dispatch task')
      setTimeout(() => setSaveError(null), 3500)
    } finally {
      setDispatching(false)
    }
  }

  const handleDispatchStatusChange = async (dispatchId: string, status: OrchestrationDispatchStatus) => {
    try {
      const response = await fetch('/api/orchestration/dispatch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: milestone.project_id,
          dispatchId,
          status,
        }),
      })

      const data = await response.json() as { error?: string; dispatch?: OrchestrationDispatchRecord }

      if (!response.ok || !data.dispatch) {
        throw new Error(data.error || `Failed to update dispatch (${response.status})`)
      }

      const updatedDispatch = data.dispatch
      setDispatches(prev =>
        prev.map(dispatch => (dispatch.id === dispatchId ? updatedDispatch : dispatch))
      )
    } catch (error) {
      console.error('Failed to update dispatch status:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to update dispatch status')
      setTimeout(() => setSaveError(null), 3000)
    }
  }

  const handleSubmit = async (e?: React.FormEvent, overrideInput?: string) => {
    e?.preventDefault()
    const messageText = (overrideInput ?? input).trim()
    if (!messageText || isLoading) return

    addDebugLog('info', 'Sending message', messageText.slice(0, 50))

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
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

      const projectContext = buildProjectContext()
      const milestoneContext = buildMilestoneContext()

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
          approach,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        addDebugLog('error', 'API error', `${response.status}: ${errorText}`)
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json() as { message: string; actions?: MilestoneAction[] }
      addDebugLog('success', 'AI response received')

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
      }

      setMessages(prev => [...prev, assistantMessage])
      void speakText(assistantMessage.content)
      await applyMilestoneActions(data.actions)

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
      setLastFailedMessage(userMessage.content)
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'I couldn\'t connect to the server. Check your connection and try again.',
          isError: true,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleVoiceInput = async () => {
    if (isLoading && !isRecording) return
    const transcript = await toggleRecordingAndTranscribe()
    if (!transcript) return
    await handleSubmit(undefined, transcript)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleRetry = () => {
    if (!lastFailedMessage || isLoading) return
    const retryText = lastFailedMessage
    // Remove error messages
    setMessages(prev => prev.filter(m => !m.isError))
    setLastFailedMessage(null)
    // Pass the message directly — React state updates are async,
    // so setInput + handleSubmit() would read the stale empty input
    handleSubmit(undefined, retryText)
  }

  const handleMarkComplete = async () => {
    try {
      await markMilestoneComplete()

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

  // Success overlay — warm, meaningful celebration
  if (showSuccess) {
    const remaining = milestone.allMilestones.filter(m => m.status !== 'completed' && m.id !== milestone.id).length
    const totalDone = milestone.allMilestones.filter(m => m.status === 'completed').length + 1
    const isProjectComplete = remaining === 0

    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] gap-6 px-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center"
        >
          <CheckCircle className="w-12 h-12 text-green-400" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center max-w-sm"
        >
          <h2 className="text-2xl font-bold text-white mb-2">
            {isProjectComplete ? 'Project Complete!' : 'Milestone Done!'}
          </h2>
          <p className="text-slate-300 mb-3">{milestone.title}</p>
          <p className="text-slate-400 text-sm leading-relaxed">
            {isProjectComplete
              ? `All ${totalDone} milestones complete. You built something real — that takes guts.`
              : remaining === 1
                ? `${totalDone} down, just 1 to go. You're almost there.`
                : `${totalDone} of ${totalCount} milestones done. Every step forward counts.`
            }
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex gap-3"
        >
          <Link
            href={`/projects/${milestone.project_id}`}
            className="px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 rounded-xl text-white font-medium transition-all"
          >
            {isProjectComplete ? 'See Your Project' : 'Keep Going'}
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleDispatchToClaude}
              disabled={dispatching}
              className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 disabled:opacity-60 disabled:cursor-not-allowed border border-purple-500/30 rounded-lg text-purple-300 text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              {dispatching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              Dispatch
            </button>
            <button
              onClick={handleMarkComplete}
              className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-green-400 text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <CheckCircle className="w-4 h-4" />
              Done
            </button>
          </div>
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
                    const isAutoFocused = autoFocusedStepId === step.id

                    return (
                      <motion.button
                        key={step.id}
                        ref={el => { stepRefs.current[step.id] = el }}
                        onClick={() => toggleStep(step.id)}
                        className={`
                          w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all
                          ${isCurrentStep && !step.is_completed
                            ? 'bg-orange-500/10 border-2 border-orange-500/30 shadow-lg shadow-orange-500/5'
                            : step.is_completed
                              ? 'bg-slate-800/30 border border-slate-700/30'
                              : 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600'
                          }
                          ${isAutoFocused ? 'ring-2 ring-teal-400/70 ring-offset-2 ring-offset-slate-900' : ''}
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

      {/* Claude Dispatch History */}
      {dispatches.length > 0 && (
        <div className="border-b border-slate-800 bg-slate-900/35">
          <button
            onClick={() => setDispatchHistoryOpen(!dispatchHistoryOpen)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Copy className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-slate-300">Claude Dispatches</span>
              <span className="text-xs text-slate-500">
                {dispatches.length} total
                {pendingDispatchCount > 0 ? ` • ${pendingDispatchCount} pending` : ''}
              </span>
            </div>
            {dispatchHistoryOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>
          <AnimatePresence>
            {dispatchHistoryOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-3 space-y-2">
                  {dispatches.slice(0, 8).map(dispatch => (
                    <div
                      key={dispatch.id}
                      className="rounded-lg border border-slate-700/60 bg-slate-800/45 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-200 truncate">{dispatch.stepText}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {new Date(dispatch.sentAt).toLocaleString()}
                          </p>
                        </div>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            dispatch.status === 'done'
                              ? 'bg-green-500/15 border-green-500/30 text-green-300'
                              : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                          }`}
                        >
                          {dispatch.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => handleCopyDispatchPrompt(dispatch.prompt)}
                          className="px-2.5 py-1 text-xs rounded border border-purple-500/30 bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 transition-colors"
                        >
                          Copy Prompt
                        </button>
                        {dispatch.status === 'pending' && (
                          <button
                            onClick={() => handleDispatchStatusChange(dispatch.id, 'done')}
                            className="px-2.5 py-1 text-xs rounded border border-green-500/30 bg-green-500/15 text-green-300 hover:bg-green-500/25 transition-colors"
                          >
                            Mark Done
                          </button>
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

      <AnimatePresence>
        {dispatchNotice && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-4 my-2 px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-sm text-purple-200"
          >
            {dispatchNotice}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionNotice && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-4 my-2 px-4 py-2 bg-teal-500/15 border border-teal-500/30 rounded-lg text-sm text-teal-200"
          >
            {actionNotice}
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
                  ${message.isError
                    ? 'bg-red-500/20'
                    : message.role === 'user'
                      ? 'bg-teal-500/20'
                      : 'bg-orange-500/20'
                  }
                `}
              >
                {message.isError ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : message.role === 'user' ? (
                  <User className="w-4 h-4 text-teal-400" />
                ) : (
                  <Zap className="w-4 h-4 text-orange-400" />
                )}
              </div>

              <div className="flex-1 max-w-[85%]">
                <div
                  className={`
                    rounded-2xl px-4 py-3
                    ${message.isError
                      ? 'bg-red-500/10 border border-red-500/30'
                      : message.role === 'user'
                        ? 'bg-teal-500/10 border border-teal-500/20'
                        : 'bg-slate-800/50 border border-slate-700/50'
                    }
                  `}
                  role={message.isError ? 'alert' : undefined}
                >
                  {message.isError ? (
                    <div className="space-y-3">
                      <p className="text-red-300 text-sm">{message.content}</p>
                      <button
                        onClick={handleRetry}
                        disabled={isLoading}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-300 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 hover:border-red-500/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Retry
                      </button>
                    </div>
                  ) : message.role === 'assistant' ? (
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

        {/* Quick Prompts — shown only when conversation is fresh (just the opener) */}
        {messages.length === 1 && messages[0].role === 'assistant' && !isLoading && contextualQuickPrompts && contextualQuickPrompts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-2 max-w-sm mx-auto"
          >
            {contextualQuickPrompts.map((prompt, index) => (
              <button
                key={index}
                onClick={() => {
                  setInput(prompt)
                  inputRef.current?.focus()
                }}
                className="w-full text-left px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-slate-300 hover:bg-slate-700/50 hover:border-orange-500/30 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-900 active:bg-slate-700 active:border-orange-500/50 active:scale-[0.98] transition-all"
              >
                {prompt}
              </button>
            ))}
          </motion.div>
        )}

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
        {/* Approach Toggle — compact, always accessible */}
        <div className="flex items-center justify-center gap-1 mb-3">
          <button
            onClick={() => setApproach('do-it')}
            className={`
              px-3 py-1 rounded-lg text-xs font-medium transition-all
              ${approach === 'do-it'
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                : 'text-slate-500 hover:text-slate-400 border border-transparent'
              }
            `}
          >
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Do it
            </span>
          </button>
          <button
            onClick={() => setApproach('guide')}
            className={`
              px-3 py-1 rounded-lg text-xs font-medium transition-all
              ${approach === 'guide'
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                : 'text-slate-500 hover:text-slate-400 border border-transparent'
              }
            `}
          >
            <span className="flex items-center gap-1">
              <Compass className="w-3 h-3" />
              Guide
            </span>
          </button>
        </div>
        <div className="mb-3">
          <VoiceControls
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            isSpeaking={isSpeaking}
            isMuted={isMuted}
            disabled={isLoading && !isRecording}
            error={voiceError}
            onMicClick={handleVoiceInput}
            onToggleMute={toggleMute}
            onDismissError={clearVoiceError}
          />
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={approach === 'do-it' ? "What do you need me to do?" : "What's your next step?"}
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
