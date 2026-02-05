'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Moon, Send, Loader2, X, AlertCircle, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { Profile, DailyLog } from '@/lib/supabase/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
}

interface EveningContentProps {
  profile: Profile | null
  todayLog: DailyLog | null
}

export function EveningContent({ profile, todayLog }: EveningContentProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null)
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const [eveningData, setEveningData] = useState<{ mood: number; energy: number; rating: number } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Check if user already completed their reflection today
  const alreadyReflected = !!(todayLog?.evening_mood || todayLog?.evening_energy)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Initialize with the AI's opening message
  useEffect(() => {
    if (initialized || !todayLog || alreadyReflected) return
    setInitialized(true)

    // Send an empty conversation to get the AI's opening
    const initConversation = async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/api/evening-reflection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: '[user opened evening reflection]' }],
            todayContext: {
              morningMood: todayLog.morning_mood,
              morningEnergy: todayLog.morning_energy,
              hasEveningData: false,
            },
          }),
        })

        if (!response.ok) throw new Error('Failed to start reflection')

        const data = await response.json()
        setMessages([{
          id: 'opener',
          role: 'assistant',
          content: data.message,
        }])
      } catch {
        setMessages([{
          id: 'opener',
          role: 'assistant',
          content: getTimeAwareOpener(profile?.display_name || null),
        }])
      } finally {
        setIsLoading(false)
      }
    }

    initConversation()
  }, [initialized, todayLog, alreadyReflected, profile?.display_name])

  const handleSubmit = async (e?: React.FormEvent, overrideInput?: string) => {
    e?.preventDefault()
    const messageText = (overrideInput ?? input).trim()
    if (!messageText || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/evening-reflection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          todayContext: {
            morningMood: todayLog?.morning_mood ?? null,
            morningEnergy: todayLog?.morning_energy ?? null,
            hasEveningData: !!eveningData,
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()

      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
      }])

      if (data.eveningData) {
        setEveningData(data.eveningData)
      }

      if (data.isComplete) {
        setIsComplete(true)
      }
    } catch {
      setLastFailedMessage(userMessage.content)
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'I couldn\'t connect. Check your connection and try again.',
        isError: true,
      }])
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

  const handleRetry = () => {
    if (!lastFailedMessage || isLoading) return
    const retryText = lastFailedMessage
    setMessages(prev => prev.filter(m => !m.isError))
    setLastFailedMessage(null)
    handleSubmit(undefined, retryText)
  }

  // Time-aware subtitle
  const hour = new Date().getHours()
  const timeGreeting = hour >= 21
    ? 'Winding down'
    : hour >= 18
    ? 'End of day'
    : 'A moment to reflect'

  // Quick prompts for the conversation
  const quickPrompts = [
    'It was a good day',
    'I\'m pretty tired',
    'Mixed feelings honestly',
    'Tell me what you noticed about my day',
  ]

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-full hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-indigo-400" />
              <span className="text-xs text-indigo-400 font-medium uppercase tracking-wide">Evening Reflection</span>
            </div>
            <p className="text-sm text-slate-500">{timeGreeting}</p>
          </div>
          {eveningData && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/25"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              <span className="text-xs text-indigo-300">Saved</span>
            </motion.div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-lg mx-auto w-full">
        {!todayLog ? (
          /* No daily log */
          <div className="flex-1 flex items-center justify-center px-4">
            <Card className="text-center py-8">
              <Moon className="w-12 h-12 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">
                No log for today yet. Start your day first, then come back tonight to reflect.
              </p>
              <Link href="/">
                <Button className="mt-4" variant="secondary">
                  Go to Today
                </Button>
              </Link>
            </Card>
          </div>
        ) : alreadyReflected && !initialized ? (
          /* Already reflected today */
          <div className="flex-1 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900/30 via-slate-800 to-purple-900/30 border border-indigo-500/20 shadow-xl"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50" />
              <div className="p-8 text-center space-y-4">
                <Moon className="w-12 h-12 mx-auto text-indigo-400" />
                <h2 className="text-2xl font-bold text-white">Already reflected</h2>
                <p className="text-slate-300 leading-relaxed">
                  You already checked in tonight. Your reflection is saved.
                  {todayLog.gratitude_entry && (
                    <span className="block mt-3 text-indigo-300/80 italic text-sm">
                      &ldquo;{todayLog.gratitude_entry}&rdquo;
                    </span>
                  )}
                </p>
                <p className="text-slate-500 text-sm">
                  Mood: {todayLog.evening_mood}/10 &middot; Energy: {todayLog.evening_energy}/10
                  {todayLog.day_rating && <span> &middot; Day: {todayLog.day_rating}/10</span>}
                </p>
                <Link href="/">
                  <Button variant="secondary" className="mt-4">
                    Back to Today
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        ) : (
          /* Conversational Reflection */
          <>
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
                            ? 'bg-indigo-500/20'
                            : 'bg-purple-500/20'
                        }
                      `}
                    >
                      {message.isError ? (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      ) : message.role === 'user' ? (
                        <div className="w-2 h-2 rounded-full bg-indigo-400" />
                      ) : (
                        <Moon className="w-4 h-4 text-purple-400" />
                      )}
                    </div>

                    {/* Message Content */}
                    <div
                      className={`
                        flex-1 max-w-[85%] rounded-2xl px-4 py-3
                        ${message.isError
                          ? 'bg-red-500/10 border border-red-500/30'
                          : message.role === 'user'
                            ? 'bg-indigo-500/10 border border-indigo-500/20'
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
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-300 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg disabled:opacity-50 transition-all"
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
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Quick prompts after the opener */}
              {messages.length === 1 && messages[0].role === 'assistant' && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-2 max-w-sm mx-auto"
                >
                  {quickPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setInput(prompt)
                        inputRef.current?.focus()
                      }}
                      className="w-full text-left px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-slate-300 hover:bg-slate-700/50 hover:border-indigo-500/30 active:scale-[0.98] transition-all"
                    >
                      {prompt}
                    </button>
                  ))}
                </motion.div>
              )}

              {/* Typing Indicator */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Moon className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-1.5" aria-label="Rise is thinking" role="status">
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
                            ease: 'easeInOut',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Completion state — show after conversation ends */}
            {isComplete && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="px-4 pb-4"
              >
                <div className="flex items-center justify-center gap-3 py-4">
                  {eveningData && (
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Mood {eveningData.mood}/10</span>
                      <span>&middot;</span>
                      <span>Energy {eveningData.energy}/10</span>
                      <span>&middot;</span>
                      <span>Day {eveningData.rating}/10</span>
                    </div>
                  )}
                </div>
                <Link href="/" className="block">
                  <button className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-300 font-medium hover:border-indigo-400/50 transition-all">
                    Sleep well. See you tomorrow.
                  </button>
                </Link>
              </motion.div>
            )}

            {/* Input Area — hide after completion */}
            {!isComplete && (
              <div className="border-t border-slate-800 p-4">
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="How are you feeling..."
                    rows={1}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                    style={{ minHeight: '48px', maxHeight: '120px' }}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    aria-label="Send"
                    className="flex-shrink-0 w-12 h-12 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <Send className="w-5 h-5 text-white" />
                    )}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </main>

      {/* Error Toast */}
      <AnimatePresence>
        {errorToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-28 left-4 right-4 max-w-lg mx-auto px-4 py-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2"
          >
            <X className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-400 flex-1">{errorToast}</span>
            <button
              onClick={() => setErrorToast(null)}
              className="text-red-400 hover:text-red-300"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom nav — only show when complete or no conversation */}
      {(isComplete || !todayLog || alreadyReflected) && (
        <div className="fixed bottom-0 left-0 right-0">
          <BottomNavigation />
        </div>
      )}
    </div>
  )
}

/**
 * Fallback opener when the API call fails.
 * Time-aware and uses display name if available.
 */
function getTimeAwareOpener(displayName: string | null): string {
  const name = displayName ? `, ${displayName}` : ''
  const hour = new Date().getHours()

  if (hour >= 21) {
    return `Hey${name}. Winding down for the night? How did today feel for you?`
  }
  if (hour >= 18) {
    return `Hey${name}. How was your day? Take a second to check in with yourself.`
  }
  return `Hey${name}. Taking a moment to reflect? How are you feeling right now?`
}
