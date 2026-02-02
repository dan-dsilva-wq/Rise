'use client'

import { Settings, TrendingUp, FolderKanban, ChevronLeft, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { PathFinderChat } from './PathFinderChat'
import type { Profile } from '@/lib/supabase/types'

interface PathFinderContentProps {
  profile: Profile | null
}

export function PathFinderContent({ profile }: PathFinderContentProps) {
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
          <Link
            href="/settings"
            className="p-2 rounded-full hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-5 h-5 text-slate-400" />
          </Link>
        </div>
      </header>

      {/* Chat Interface */}
      <main className="flex-1 max-w-lg mx-auto w-full">
        <PathFinderChat />
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 safe-bottom">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-around">
          <Link
            href="/"
            className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-200"
          >
            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
              <span className="text-xs text-slate-300 font-bold">R</span>
            </div>
            <span className="text-xs">Today</span>
          </Link>

          <Link
            href="/projects"
            className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-200"
          >
            <FolderKanban className="w-6 h-6" />
            <span className="text-xs">Projects</span>
          </Link>

          <Link
            href="/progress"
            className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-200"
          >
            <TrendingUp className="w-6 h-6" />
            <span className="text-xs">Progress</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
