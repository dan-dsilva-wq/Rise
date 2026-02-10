'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createBrowserClient } from '@supabase/ssr'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface FeedbackItem {
  id: string
  user_id: string
  summary: string
  is_read: boolean
  created_at: string
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

export default function FeedbackPage() {
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('rise_feedback')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setFeedbackItems(data as FeedbackItem[])

        // Mark unread items as read
        const unreadIds = (data as FeedbackItem[]).filter(f => !f.is_read).map(f => f.id)
        if (unreadIds.length > 0) {
          await supabase
            .from('rise_feedback')
            .update({ is_read: true })
            .in('id', unreadIds)

          setFeedbackItems(prev =>
            prev.map(f => unreadIds.includes(f.id) ? { ...f, is_read: true } : f)
          )
        }
      }

      setLoading(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex justify-center items-center">
        <div className="w-8 h-8 border-2 border-teal-400 border-t-teal-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <main className="max-w-2xl mx-auto px-4 py-8 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/"
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">User Feedback</h1>
            <p className="text-sm text-slate-400">
              Feedback from beta testers
            </p>
          </div>
        </div>

        {/* Empty state */}
        {feedbackItems.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">💬</p>
            <p className="text-slate-400">No feedback yet</p>
            <p className="text-sm text-slate-500 mt-1">
              When users send feedback through the chat, it&apos;ll show up here
            </p>
          </div>
        )}

        {/* Feedback list */}
        <div className="space-y-4">
          <AnimatePresence>
            {feedbackItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`relative p-5 rounded-2xl transition-colors ${
                  item.is_read
                    ? 'bg-slate-800'
                    : 'bg-teal-900/20 ring-1 ring-teal-700'
                }`}
              >
                {/* Unread indicator */}
                {!item.is_read && (
                  <div className="absolute top-4 right-4">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500" />
                    </span>
                  </div>
                )}

                {/* Timestamp */}
                <div className="text-xs text-slate-500 mb-2">
                  {formatDate(item.created_at)}
                </div>

                {/* Summary content */}
                <div className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
                  {item.summary}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
