'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Loader2, User, Zap, ArrowLeft, CheckCircle, Target } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import { useMilestoneConversation } from '@/lib/hooks/useMilestoneConversation'
import { createClient } from '@/lib/supabase/client'
import { addDebugLog } from '@/components/ui/ConnectionStatus'
import type { Milestone, Project, MilestoneConversation, MilestoneMessage } from '@/lib/supabase/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface MilestoneWithProject extends Milestone {
  project: Project
  allMilestones: Milestone[]
}

interface MilestoneModeChatProps {
  userId: string
  milestone: MilestoneWithProject
  initialConversation?: MilestoneConversation | null
  initialMessages?: MilestoneMessage[]
}

const INITIAL_MESSAGE = (milestoneName: string) => `Let's get "${milestoneName}" done.

**What's the very first thing you need to do to make progress on this?**

(If you're not sure, tell me what's making you stuck and we'll figure it out together.)`

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
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
        // New conversation - show initial message
        setMessages([{
          id: 'initial',
          role: 'assistant',
          content: INITIAL_MESSAGE(milestone.title),
        }])
        // Save initial message
        saveMessage('assistant', INITIAL_MESSAGE(milestone.title))
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
        // New conversation
        setMessages([{
          id: 'initial',
          role: 'assistant',
          content: INITIAL_MESSAGE(milestone.title),
        }])
        saveMessage('assistant', INITIAL_MESSAGE(milestone.title))
      }
    }
    setInitialized(true)
  }, [initialized, hasInitialData, initialMessages, initialConversation, convoLoading, currentConversation, milestone.title, saveMessage, setCurrentDirect])

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

      const milestoneContext = {
        id: milestone.id,
        title: milestone.title,
        description: milestone.description,
        status: milestone.status,
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
