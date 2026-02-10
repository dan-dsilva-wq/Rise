'use client'

import type { FormEvent, KeyboardEvent, RefObject } from 'react'
import { Loader2, Send } from 'lucide-react'
import { VoiceControls } from '@/components/voice/VoiceControls'

interface PathFinderComposerProps {
  input: string
  isLoading: boolean
  inputRef: RefObject<HTMLTextAreaElement | null>
  onInputChange: (value: string) => void
  onKeyDown: (e: KeyboardEvent) => void
  onSubmit: (e?: FormEvent) => void
  voice?: {
    isRecording: boolean
    isTranscribing: boolean
    isSpeaking: boolean
    isMuted: boolean
    error?: string | null
    disabled?: boolean
    onMicClick: () => void | Promise<void>
    onToggleMute: () => void
    onDismissError?: () => void
  }
}

export function PathFinderComposer({
  input,
  isLoading,
  inputRef,
  onInputChange,
  onKeyDown,
  onSubmit,
  voice,
}: PathFinderComposerProps) {
  return (
    <div className="border-t border-slate-800 p-4 bg-slate-900">
      <form onSubmit={onSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Share your thoughts..."
            rows={1}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50"
            style={{
              minHeight: '48px',
              maxHeight: '120px',
            }}
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="flex-shrink-0 w-12 h-12 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <Send className="w-5 h-5 text-white" />
          )}
        </button>
      </form>
      {voice && (
        <div className="mt-2">
          <VoiceControls
            isRecording={voice.isRecording}
            isTranscribing={voice.isTranscribing}
            isSpeaking={voice.isSpeaking}
            isMuted={voice.isMuted}
            disabled={voice.disabled}
            error={voice.error}
            onMicClick={voice.onMicClick}
            onToggleMute={voice.onToggleMute}
            onDismissError={voice.onDismissError}
          />
        </div>
      )}
      <p className="text-xs text-slate-500 mt-2">
        Press Enter to send - Conversations auto-save
      </p>
    </div>
  )
}
