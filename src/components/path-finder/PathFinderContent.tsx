'use client'

import { ChevronLeft, Sparkles, HeartHandshake } from 'lucide-react'
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
  initialStarter?: string | null
  autoSendStarter?: boolean
}

export function PathFinderContent({
  userId,
  initialConversation,
  initialConversations,
  initialMessages,
  initialFacts,
  initialStarter = null,
  autoSendStarter = false,
}: PathFinderContentProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[radial-gradient(circle_at_top,_rgba(255,179,107,0.28),transparent_52%),linear-gradient(180deg,#fff6e9_0%,#f7f2e8_45%,#efe8dc_100%)] text-[#1e2a2e]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[#dbcdb8] bg-[#fff7ea]/92 backdrop-blur-lg">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 rounded-xl hover:bg-[#f0e4d3] transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-[#6f5b41]" />
            </Link>
            <div>
              <h1 className="font-display text-2xl text-[#2a2f2f] flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#0f766e]" />
                Path Finder
              </h1>
              <p className="text-sm text-[#6c706f]">Find the path you actually want to wake up for</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#d5c5ab] bg-white/70 text-xs text-[#516869]">
            <HeartHandshake className="w-3.5 h-3.5 text-[#0f766e]" />
            One conversation, one clear next step
          </div>
        </div>
      </header>

      {/* Chat Interface */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-2 md:px-4">
        <PathFinderChat
          userId={userId}
          initialConversation={initialConversation}
          initialConversations={initialConversations}
          initialMessages={initialMessages}
          initialFacts={initialFacts}
          initialStarter={initialStarter}
          autoSendStarter={autoSendStarter}
        />
      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0">
        <BottomNavigation />
      </div>
    </div>
  )
}
