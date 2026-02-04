'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Loader2, Bot, User, Sparkles, Copy, Check, AlertCircle, RotateCcw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { Project, Milestone, ProjectLog } from '@/lib/supabase/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isError?: boolean
}

interface BuilderChatProps {
  project: Project
  milestones: Milestone[]
  initialMessages?: ProjectLog[]
}

export function BuilderChat({ project, milestones, initialMessages = [] }: BuilderChatProps) {
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
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

      const data = await response.json()

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
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

    // Remove the last error message
    setMessages(prev => prev.filter(m => !m.isError))
    setLastFailedMessage(null)

    // Set input and trigger submit
    setInput(lastFailedMessage)
    // Use setTimeout to ensure state is updated before submit
    setTimeout(() => {
      handleSubmit()
    }, 0)
  }

  // Quick prompts for empty state
  const quickPrompts = [
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
          // Empty State
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-500/10 mb-4">
              <Sparkles className="w-8 h-8 text-teal-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">AI Builder Ready</h3>
            <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
              I&apos;m here to help you build <strong className="text-white">{project.name}</strong>.
              Ask me anything about your project.
            </p>

            {/* Quick Prompts */}
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
          // Messages
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
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-purple-400" />
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

      {/* Input Area */}
      <div className="border-t border-slate-800 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your project..."
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
