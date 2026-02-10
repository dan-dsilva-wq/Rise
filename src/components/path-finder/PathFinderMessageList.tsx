'use client'

import type { RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CheckCircle, Copy, FolderPlus, Loader2, Rocket, Sparkles, User } from 'lucide-react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'

import type { Message } from './types'

interface PathFinderMessageListProps {
  messages: Message[]
  isLoading: boolean
  copiedMessageId: string | null
  onCopyMessage: (messageId: string, content: string) => void
  messagesEndRef: RefObject<HTMLDivElement | null>
}

export function PathFinderMessageList({
  messages,
  isLoading,
  copiedMessageId,
  onCopyMessage,
  messagesEndRef,
}: PathFinderMessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto px-2 py-4 space-y-4">
      <AnimatePresence initial={false}>
        {messages.map(message => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`
                flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                ${message.role === 'user'
                  ? 'bg-teal-500/20'
                  : 'bg-purple-500/20'
                }
              `}
            >
              {message.role === 'user' ? (
                <User className="w-4 h-4 text-teal-400" />
              ) : (
                <Sparkles className="w-4 h-4 text-purple-400" />
              )}
            </div>

            <div className="flex-1 max-w-[85%] space-y-3">
              <div className="group relative">
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
                <button
                  onClick={() => onCopyMessage(message.id, message.content)}
                  className={`absolute -bottom-2 right-2 p-1.5 rounded-lg text-xs transition-all
                    ${copiedMessageId === message.id
                      ? 'bg-green-500/20 text-green-400 opacity-100'
                      : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-white md:opacity-0 md:group-hover:opacity-100'
                    }`}
                >
                  {copiedMessageId === message.id ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>

              {message.actionResults && message.actionResults.length > 0 && (
                <div className="space-y-2">
                  {message.actionResults.map((result, idx) => {
                    const hasLink = result.milestoneId && result.projectId
                    const linkHref = hasLink
                      ? `/projects/${result.projectId}/milestone/${result.milestoneId}`
                      : result.projectId
                        ? `/projects/${result.projectId}`
                        : null

                    const cardContent = (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`
                          bg-gradient-to-br rounded-xl p-3
                          ${result.isIdea
                            ? 'from-amber-500/20 to-orange-500/20 border border-amber-500/30'
                            : 'from-teal-500/20 to-purple-500/20 border border-teal-500/30'}
                          ${linkHref ? 'cursor-pointer hover:border-teal-400/50 transition-colors' : ''}
                        `}
                      >
                        <div className="flex items-center gap-2">
                          {result.type === 'create_project' ? (
                            <Rocket className="w-4 h-4 text-purple-400" />
                          ) : result.isIdea ? (
                            <Sparkles className="w-4 h-4 text-amber-400" />
                          ) : result.type === 'complete_milestone' ? (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          ) : (
                            <FolderPlus className="w-4 h-4 text-teal-400" />
                          )}
                          <span className={`text-sm font-medium ${
                            result.isIdea ? 'text-amber-400' : 'text-teal-400'
                          }`}>
                            {result.text}
                          </span>
                        </div>
                        {linkHref && (
                          <p className="text-xs text-slate-500 mt-1 ml-6">Tap to view</p>
                        )}
                      </motion.div>
                    )

                    return linkHref ? (
                      <Link key={idx} href={linkHref}>
                        {cardContent}
                      </Link>
                    ) : (
                      <div key={idx}>{cardContent}</div>
                    )
                  })}
                </div>
              )}
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
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-purple-400" />
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
  )
}
