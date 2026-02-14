'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Loader2, Bot, User, Sparkles, Copy, Check, AlertCircle, RotateCcw, Zap, Compass, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { VoiceControls } from '@/components/voice/VoiceControls'
import { useVoiceConversation } from '@/lib/hooks/useVoiceConversation'
import type { Project, Milestone, ProjectLog } from '@/lib/supabase/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isError?: boolean
}

type Approach = 'do-it' | 'guide'
type ReasoningMode = 'single' | 'council'

interface ReturnContext {
  message: string
  milestone: string | null
}

interface BuilderChatProps {
  project: Project
  milestones: Milestone[]
  initialMessages?: ProjectLog[]
  /** Server-generated contextual opener (memory-aware, replaces static empty state) */
  contextualOpener?: string | null
  /** Context-aware quick prompts (generated alongside opener) */
  contextualQuickPrompts?: string[] | null
  /** For returning users with chat history — a continuity message acknowledging where they left off */
  returnContext?: ReturnContext | null
}

export function BuilderChat({ project, milestones, initialMessages = [], contextualOpener, contextualQuickPrompts, returnContext }: BuilderChatProps) {
  const [messages, setMessages] = useState<Message[]>(() =>
    initialMessages.map(log => ({
      id: log.id,
      role: log.role as 'user' | 'assistant',
      content: log.content,
      timestamp: new Date(log.created_at),
    }))
  )
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null)
  const [approach, setApproach] = useState<Approach>('guide')
  const [reasoningMode, setReasoningMode] = useState<ReasoningMode>('single')
  const [reasoningHint, setReasoningHint] = useState<string | null>(null)
  const [returnBannerDismissed, setReturnBannerDismissed] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e?: React.FormEvent, overrideInput?: string) => {
    e?.preventDefault()

    const messageText = (overrideInput ?? input).trim()
    if (!messageText || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          projectId: project.id,
          approach,
          reasoningMode,
          projectContext: {
            name: project.name,
            description: project.description,
            status: project.status,
            milestones: milestones.map(m => ({
              title: m.title,
              status: m.status,
              description: m.description,
            })),
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json() as {
        message: string
        reasoningMode?: ReasoningMode
        requestedReasoningMode?: ReasoningMode
        councilFallbackUsed?: boolean
      }

      if (data.requestedReasoningMode === 'council' && data.councilFallbackUsed) {
        setReasoningHint('Council was unavailable this turn, so Rise used single-mind fallback.')
      } else if (data.reasoningMode === 'council') {
        setReasoningHint('Council mode active: Analyst + Critic + Strategist + Operator.')
      } else {
        setReasoningHint(null)
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
      void speakText(assistantMessage.content)
    } catch (error) {
      console.error('Chat error:', error)

      // Store the failed message for retry
      setLastFailedMessage(userMessage.content)

      // Add error message with distinct styling
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'I couldn\'t connect to the server. Check your connection and try again.',
          timestamp: new Date(),
          isError: true,
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

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRetry = () => {
    if (!lastFailedMessage || isLoading) return

    const retryText = lastFailedMessage

    // Remove the last error message
    setMessages(prev => prev.filter(m => !m.isError))
    setLastFailedMessage(null)

    // Pass the message directly — React state updates are async,
    // so setInput + handleSubmit() would read the stale empty input
    handleSubmit(undefined, retryText)
  }

  const handleVoiceInput = async () => {
    if (isLoading && !isRecording) return
    const transcript = await toggleRecordingAndTranscribe()
    if (!transcript) return
    await handleSubmit(undefined, transcript)
  }

  // Quick prompts for empty state — use contextual prompts if available
  const quickPrompts = contextualQuickPrompts || [
    "What should I work on first?",
    "Help me break down this milestone",
    "I'm stuck - what's the smallest next step?",
    "Review my progress and suggest next steps",
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          // Empty State — contextual opener or fallback
          <div className="py-8 px-2">
            {contextualOpener ? (
              // Memory-aware opener: shows like a first assistant message
              <div className="flex gap-3 mb-6">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                </div>
                <div className="flex-1 max-w-[85%] rounded-2xl px-4 py-3 bg-slate-800/50 border border-slate-700/50">
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{contextualOpener}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ) : (
              // Fallback generic state
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-500/10 mb-4">
                  <Sparkles className="w-8 h-8 text-teal-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">AI Builder Ready</h3>
                <p className="text-sm text-slate-400 max-w-sm mx-auto">
                  I&apos;m here to help you build <strong className="text-white">{project.name}</strong>.
                  Ask me anything about your project.
                </p>
              </div>
            )}

            {/* Approach Selector — How should Rise help? */}
            <div className="mb-6 max-w-sm mx-auto">
              <p className="text-xs text-slate-500 text-center mb-3 uppercase tracking-wide font-medium">How should I help?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setApproach('do-it')}
                  className={`
                    relative p-3 rounded-xl border text-left transition-all
                    ${approach === 'do-it'
                      ? 'bg-teal-500/15 border-teal-500/40 ring-1 ring-teal-500/30'
                      : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                    }
                  `}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className={`w-4 h-4 ${approach === 'do-it' ? 'text-teal-400' : 'text-slate-500'}`} />
                    <span className={`text-sm font-medium ${approach === 'do-it' ? 'text-teal-300' : 'text-slate-300'}`}>
                      Do it for me
                    </span>
                  </div>
                  <p className={`text-xs ${approach === 'do-it' ? 'text-teal-400/70' : 'text-slate-500'}`}>
                    Write code, content, plans
                  </p>
                </button>
                <button
                  onClick={() => setApproach('guide')}
                  className={`
                    relative p-3 rounded-xl border text-left transition-all
                    ${approach === 'guide'
                      ? 'bg-purple-500/15 border-purple-500/40 ring-1 ring-purple-500/30'
                      : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                    }
                  `}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Compass className={`w-4 h-4 ${approach === 'guide' ? 'text-purple-400' : 'text-slate-500'}`} />
                    <span className={`text-sm font-medium ${approach === 'guide' ? 'text-purple-300' : 'text-slate-300'}`}>
                      Guide me
                    </span>
                  </div>
                  <p className={`text-xs ${approach === 'guide' ? 'text-purple-400/70' : 'text-slate-500'}`}>
                    Think together, learn
                  </p>
                </button>
              </div>
            </div>

            {/* Quick Prompts — contextual or default */}
            <div className="space-y-2 max-w-sm mx-auto">
              {quickPrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setInput(prompt)
                    inputRef.current?.focus()
                  }}
                  className="w-full text-left px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-slate-300 hover:bg-slate-700/50 hover:border-teal-500/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-900 active:bg-slate-700 active:border-teal-500/50 active:scale-[0.98] transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Messages (with optional return-context banner for returning users)
          <>
          {/* Continuity Banner — "Rise remembers where you left off" */}
          {returnContext && !returnBannerDismissed && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 relative overflow-hidden rounded-xl bg-gradient-to-r from-purple-900/20 via-slate-800/60 to-teal-900/20 border border-purple-500/15"
            >
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
              <div className="px-4 py-3 flex items-start gap-3">
                <div className="mt-0.5 p-1 rounded-full bg-purple-500/20 flex-shrink-0">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-purple-400/50 mb-1">
                    Rise remembers
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {returnContext.message.split('**').map((part, i) =>
                      i % 2 === 1
                        ? <strong key={i} className="text-white font-medium">{part}</strong>
                        : <span key={i}>{part}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setReturnBannerDismissed(true)}
                  className="p-1 text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0"
                  aria-label="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div
                  className={`
                    flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                    ${message.isError
                      ? 'bg-red-500/20'
                      : message.role === 'user'
                        ? 'bg-teal-500/20'
                        : 'bg-purple-500/20'
                    }
                  `}
                >
                  {message.isError ? (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  ) : message.role === 'user' ? (
                    <User className="w-4 h-4 text-teal-400" />
                  ) : (
                    <Bot className="w-4 h-4 text-purple-400" />
                  )}
                </div>

                {/* Message Content */}
                <div
                  className={`
                    flex-1 max-w-[85%] rounded-2xl px-4 py-3
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
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-300 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 hover:border-red-500/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Retry
                      </button>
                    </div>
                  ) : message.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700">
                      <ReactMarkdown
                        components={{
                          // Custom code block with copy button
                          pre: ({ children, ...props }) => {
                            return (
                              <div className="relative group">
                                <pre className="!mt-0" {...props}>{children}</pre>
                                <button
                                  onClick={(e) => {
                                    const pre = e.currentTarget.parentElement?.querySelector('pre')
                                    const code = pre?.textContent || ''
                                    if (code) {
                                      copyToClipboard(code, message.id)
                                    }
                                  }}
                                  className="absolute top-2 right-2 p-1.5 rounded bg-slate-700/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  {copiedId === message.id ? (
                                    <Check className="w-4 h-4 text-teal-400" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-slate-400" />
                                  )}
                                </button>
                              </div>
                            )
                          },
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-white whitespace-pre-wrap">{message.content}</p>
                  )}

                  <div className="mt-2 text-xs text-slate-500">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          </>
        )}

        {/* Typing Indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex gap-3"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-purple-400" />
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-1.5" aria-label="AI is typing" role="status">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-2 h-2 bg-purple-400 rounded-full"
                    animate={{
                      y: [0, -6, 0],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-800 p-4">
        {/* Approach Toggle — compact, always accessible */}
        <div className="flex items-center justify-center gap-1 mb-3">
          <button
            onClick={() => setApproach('do-it')}
            className={`
              px-3 py-1 rounded-lg text-xs font-medium transition-all
              ${approach === 'do-it'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
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
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
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
        <div className="flex items-center justify-center gap-1 mb-3">
          <button
            onClick={() => setReasoningMode('single')}
            className={`
              px-3 py-1 rounded-lg text-xs font-medium transition-all
              ${reasoningMode === 'single'
                ? 'bg-slate-700/80 text-slate-100 border border-slate-600'
                : 'text-slate-500 hover:text-slate-400 border border-transparent'
              }
            `}
          >
            Single mind
          </button>
          <button
            onClick={() => setReasoningMode('council')}
            className={`
              px-3 py-1 rounded-lg text-xs font-medium transition-all
              ${reasoningMode === 'council'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-500 hover:text-slate-400 border border-transparent'
              }
            `}
          >
            Council
          </button>
        </div>
        {reasoningHint && (
          <p className="mb-3 text-center text-xs text-indigo-300/80">
            {reasoningHint}
          </p>
        )}
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
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={approach === 'do-it' ? "What do you need me to build?" : "Ask anything about your project..."}
              rows={1}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              style={{
                minHeight: '48px',
                maxHeight: '120px',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
            className="flex-shrink-0 w-12 h-12 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:bg-slate-700 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-900 active:bg-teal-600 active:scale-95 transition-all flex items-center justify-center"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Send className="w-5 h-5 text-white" />
            )}
          </button>
        </form>
        <p className="text-xs text-slate-500 mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
