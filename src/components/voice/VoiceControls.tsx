'use client'

import { Loader2, Mic, Square, Volume2, VolumeX } from 'lucide-react'

interface VoiceControlsProps {
  isRecording: boolean
  isTranscribing: boolean
  isSpeaking: boolean
  isMuted: boolean
  disabled?: boolean
  error?: string | null
  onMicClick: () => void | Promise<void>
  onToggleMute: () => void
  onDismissError?: () => void
}

export function VoiceControls({
  isRecording,
  isTranscribing,
  isSpeaking,
  isMuted,
  disabled = false,
  error,
  onMicClick,
  onToggleMute,
  onDismissError,
}: VoiceControlsProps) {
  const micBusy = isTranscribing
  const micDisabled = disabled || micBusy
  const status = isRecording
    ? 'Listening'
    : isTranscribing
      ? 'Transcribing'
      : isSpeaking
        ? 'Speaking'
        : null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void onMicClick() }}
            disabled={micDisabled}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              isRecording
                ? 'border-red-500/40 bg-red-500/20 text-red-200 hover:bg-red-500/30'
                : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-600 hover:bg-slate-700'
            } ${micDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            {isTranscribing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isRecording ? (
              <Square className="h-3.5 w-3.5" />
            ) : (
              <Mic className="h-3.5 w-3.5" />
            )}
            <span>{isRecording ? 'Stop' : 'Speak'}</span>
          </button>

          {status && (
            <span className="text-xs text-slate-500">{status}</span>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
            isMuted
              ? 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
              : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
          }`}
        >
          {isMuted ? (
            <VolumeX className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
          <span>{isMuted ? 'Voice off' : 'Voice on'}</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
          <span>{error}</span>
          {onDismissError && (
            <button
              type="button"
              onClick={onDismissError}
              className="text-red-300/80 hover:text-red-200"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  )
}
