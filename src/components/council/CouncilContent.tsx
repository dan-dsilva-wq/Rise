'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, Loader2, Scale, Users } from 'lucide-react'
import Link from 'next/link'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { Button } from '@/components/ui/Button'

interface CouncilBreakdown {
  analyst: string
  critic: string
  strategist: string
  operator: string
  synthesis: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  council?: CouncilBreakdown | null
}

const QUICK_PROMPTS = [
  'Help me choose between two paths with clear tradeoffs.',
  'What am I likely not seeing in this decision?',
  'Stress test this plan before I commit.',
]

export function CouncilContent() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'intro',
      role: 'assistant',
      content: 'Council room is open. Bring me a decision and I will run Analyst, Critic, Strategist, and Operator before giving one recommendation.',
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null)
  const [briefDecision, setBriefDecision] = useState('')
  const [briefOptions, setBriefOptions] = useState('')
  const [briefConstraints, setBriefConstraints] = useState('')
  const [briefTimeline, setBriefTimeline] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    setIsLoading(true)
    setError(null)

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')

    try {
      const response = await fetch('/api/council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(message => ({
            role: message.role,
            content: message.content,
          })),
        }),
      })

      const data = await response.json() as {
        message?: string
        council?: CouncilBreakdown | null
        error?: string
      }

      if (!response.ok || !data.message) {
        throw new Error(data.error || `Council request failed (${response.status})`)
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        council: data.council || null,
      }

      setMessages(prev => [...prev, assistantMessage])
      if (assistantMessage.council) {
        setExpandedMessageId(assistantMessage.id)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Council request failed')
      setMessages(prev => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: 'I could not run the council turn. Please try again.',
        },
      ])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [isLoading, messages])

  const handleSubmit = useCallback((event?: React.FormEvent) => {
    event?.preventDefault()
    void sendMessage(input)
  }, [input, sendMessage])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage(input)
    }
  }, [input, sendMessage])

  const buildDecisionBrief = useCallback(() => {
    const lines: string[] = []
    if (briefDecision.trim()) lines.push(`Decision: ${briefDecision.trim()}`)
    if (briefOptions.trim()) lines.push(`Options I am considering: ${briefOptions.trim()}`)
    if (briefConstraints.trim()) lines.push(`Constraints / non-negotiables: ${briefConstraints.trim()}`)
    if (briefTimeline.trim()) lines.push(`Timeline / deadline: ${briefTimeline.trim()}`)
    lines.push('Please run council mode and give me a direct recommendation with tradeoffs and the next 3 actions.')
    setInput(lines.join('\n'))
    inputRef.current?.focus()
  }, [briefConstraints, briefDecision, briefOptions, briefTimeline])

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 -ml-2 rounded-lg hover:bg-slate-800 transition-colors">
              <ChevronLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-300" />
                Council Room
              </h1>
              <p className="text-sm text-slate-400">General decision making</p>
            </div>
          </div>
          <Link href="/path-finder" className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
            Path Finder
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full flex flex-col">
        <section className="px-4 pt-4">
          <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/10 p-3">
            <p className="text-sm text-indigo-100">
              Bring strategic choices here. Council compares tradeoffs before recommending a move.
            </p>
          </div>

          <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Decision Brief Helper</p>
            <input
              value={briefDecision}
              onChange={event => setBriefDecision(event.target.value)}
              placeholder="Decision to make"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-400/40 focus:outline-none"
            />
            <input
              value={briefOptions}
              onChange={event => setBriefOptions(event.target.value)}
              placeholder="Options (comma-separated)"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-400/40 focus:outline-none"
            />
            <input
              value={briefConstraints}
              onChange={event => setBriefConstraints(event.target.value)}
              placeholder="Constraints / non-negotiables"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-400/40 focus:outline-none"
            />
            <div className="flex gap-2">
              <input
                value={briefTimeline}
                onChange={event => setBriefTimeline(event.target.value)}
                placeholder="Timeline / deadline"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-400/40 focus:outline-none"
              />
              <button
                type="button"
                onClick={buildDecisionBrief}
                className="rounded-lg border border-indigo-400/40 px-3 py-2 text-xs text-indigo-200 hover:bg-indigo-500/10 transition-colors"
              >
                Use in prompt
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map(prompt => (
              <button
                key={prompt}
                type="button"
                onClick={() => setInput(prompt)}
                className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-indigo-400/40 hover:text-indigo-200 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        <section className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map(message => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-teal-500/20 border border-teal-500/30 text-teal-100'
                  : 'bg-slate-800 border border-slate-700 text-slate-100'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                {message.role === 'assistant' && message.council && (
                  <div className="mt-3 border-t border-slate-700 pt-2">
                    <button
                      type="button"
                      onClick={() => setExpandedMessageId(prev => prev === message.id ? null : message.id)}
                      className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200"
                    >
                      <Scale className="w-3.5 h-3.5" />
                      Council breakdown
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedMessageId === message.id ? 'rotate-180' : ''}`} />
                    </button>

                    {expandedMessageId === message.id && (
                      <div className="mt-2 space-y-2 text-xs text-slate-300">
                        <p><span className="text-indigo-300">Analyst:</span> {message.council.analyst}</p>
                        <p><span className="text-indigo-300">Critic:</span> {message.council.critic}</p>
                        <p><span className="text-indigo-300">Strategist:</span> {message.council.strategist}</p>
                        <p><span className="text-indigo-300">Operator:</span> {message.council.operator}</p>
                        <p><span className="text-indigo-300">Synthesis:</span> {message.council.synthesis}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-slate-800 border border-slate-700 text-slate-300 text-sm inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-300" />
                Council thinking...
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-300">{error}</p>
          )}

          <div ref={endRef} />
        </section>

        <section className="border-t border-slate-800 bg-slate-900/90 px-4 py-3">
          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the decision you are trying to make..."
              disabled={isLoading}
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-400/40 focus:outline-none"
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={isLoading || !input.trim()}
              isLoading={isLoading}
              loadingText="Running council..."
            >
              Ask Council
            </Button>
          </form>
        </section>
      </main>

      <BottomNavigation />
    </div>
  )
}
