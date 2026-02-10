'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { VoiceControls } from '@/components/voice/VoiceControls'
import { useVoiceConversation } from '@/lib/hooks/useVoiceConversation'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface FeedbackChatProps {
  isOpen: boolean
  onClose: () => void
}

export function FeedbackChat({ isOpen, onClose }: FeedbackChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hey! What would you like to tell Dan about Rise? Could be anything — a feature idea, something that bugs you, or just a suggestion!",
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasSentSummary, setHasSentSummary] = useState(false)
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

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  const buildPayload = useCallback(() => {
    return JSON.stringify({
      messages: messages.filter(m => m.id !== 'welcome').map(m => ({
        role: m.role,
        content: m.content,
      })),
      action: 'summarize',
    })
  }, [messages])

  const buildBeaconPayload = useCallback(() => {
    return new Blob([buildPayload()], { type: 'application/json' })
  }, [buildPayload])

  const sendSummaryAndClose = useCallback(async () => {
    if (hasSentSummary) {
      onClose()
      return
    }

    const userMessages = messages.filter(m => m.role === 'user')
    if (userMessages.length === 0) {
      onClose()
      return
    }

    setHasSentSummary(true)

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildPayload(),
      })
    } catch (error) {
      console.error('Error sending summary:', error)
    }

    onClose()
  }, [messages, hasSentSummary, onClose, buildPayload])

  // Handle page close/navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      const userMessages = messages.filter(m => m.role === 'user')
      if (userMessages.length > 0 && !hasSentSummary && isOpen) {
        navigator.sendBeacon('/api/feedback', buildBeaconPayload())
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isOpen) {
        const userMessages = messages.filter(m => m.role === 'user')
        if (userMessages.length > 0 && !hasSentSummary) {
          navigator.sendBeacon('/api/feedback', buildBeaconPayload())
          setHasSentSummary(true)
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [messages, hasSentSummary, isOpen, buildPayload])

  const handleSubmit = async (e?: React.FormEvent, overrideInput?: string) => {
    e?.preventDefault()

    const messageText = (overrideInput ?? input).trim()
    if (!messageText || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages.filter(m => m.id !== 'welcome'), userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          action: 'chat',
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
      }

      setMessages(prev => [...prev, assistantMessage])
      void speakText(assistantMessage.content)

      // If AI says it's complete, send the summary
      if (data.isComplete) {
        setHasSentSummary(true)
        await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages.filter(m => m.id !== 'welcome'), userMessage, { role: 'assistant', content: data.message }].map(m => ({
              role: m.role,
              content: m.content,
            })),
            action: 'summarize',
          }),
        })
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, something went wrong. Try again?',
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={sendSummaryAndClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-lg h-[80vh] max-h-[600px] bg-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <div>
                <h2 className="font-semibold text-white">Send Feedback</h2>
                <p className="text-xs text-slate-400">Ideas, bugs, anything!</p>
              </div>
              <button
                onClick={sendSummaryAndClose}
                className="p-2 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-teal-600 text-white rounded-br-md'
                        : 'bg-slate-700 text-slate-100 rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </motion.div>
              ))}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-slate-700 px-4 py-2 rounded-2xl rounded-bl-md">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-700 p-4">
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
              <form onSubmit={handleSubmit} className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  rows={1}
                  className="flex-1 px-4 py-2 bg-slate-700 border-0 rounded-xl text-white placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                  style={{ minHeight: '44px', maxHeight: '100px' }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="px-4 py-2 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Send
                </button>
              </form>
              <p className="text-xs text-slate-500 mt-2 text-center">
                {hasSentSummary ? 'Sent to Dan!' : 'Press Enter to send'}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
