'use client'

import { ChevronLeft, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { PathFinderChat } from './PathFinderChat'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import type { PathFinderConversation, PathFinderMessage, UserProfileFact } from '@/lib/supabase/types'

interface PathFinderContentProps {
  userId: string
  initialConversation: PathFinderConversation | null
  initialConversations: PathFinderConversation[]
  initialMessages: PathFinderMessage[]
  initialFacts: UserProfileFact[]
}

export function PathFinderContent({ userId, initialConversation, initialConversations, initialMessages, initialFacts }: PathFinderContentProps) {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                Path Finder
              </h1>
              <p className="text-sm text-slate-400">Find what to build</p>
            </div>
          </div>
        </div>
      </header>

      {/* Chat Interface */}
      <main className="flex-1 max-w-lg mx-auto w-full">
        <PathFinderChat
          userId={userId}
          initialConversation={initialConversation}
          initialConversations={initialConversations}
          initialMessages={initialMessages}
          initialFacts={initialFacts}
        />
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  )
}
