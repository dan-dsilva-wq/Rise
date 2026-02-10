'use client'

import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mic, MicOff, Square, Loader2 } from 'lucide-react'
import { useBrainDumpReducer, type TranscriptMessage } from './useBrainDumpReducer'
import { useAudioRecorder } from './useAudioRecorder'
import { VoiceWaveform } from './VoiceWaveform'

interface BrainDumpOverlayProps {
  isOpen: boolean
  onClose: () => void
}

export function BrainDumpOverlay({ isOpen, onClose }: BrainDumpOverlayProps) {
  const { state, actions } = useBrainDumpReducer()
  const recorder = useAudioRecorder()
  const scrollRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startTimeRef = useRef<number>(0)

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [state.transcript])

  // Handle open — auto-start recording so it's one tap to speak
  useEffect(() => {
    if (isOpen && state.phase === 'IDLE') {
      actions.open()
      startTimeRef.current = Date.now()
      // Brief delay then start recording automatically
      setTimeout(async () => {
        try {
          await recorder.startRecording()
          actions.startRecording()
        } catch {
          // Mic denied — fall back to ready state
          actions.ready()
        }
      }, 300)
    }
  }, [isOpen, state.phase, actions, recorder])

  const transcribeAudio = useCallback(async (blob: Blob) => {
    const formData = new FormData()
    // Determine file extension from mime type
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
    formData.append('audio', blob, `recording.${ext}`)

    const res = await fetch('/api/brain-dump/transcribe', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) throw new Error('Transcription failed')
    const data = await res.json()
    return data.text as string
  }, [])

  const getChatResponse = useCallback(async (messages: TranscriptMessage[]) => {
    const res = await fetch('/api/brain-dump/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    })

    if (!res.ok) throw new Error('Chat failed')
    const data = await res.json()
    return data.message as string
  }, [])

  const speakText = useCallback(async (text: string) => {
    const res = await fetch('/api/brain-dump/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!res.ok) throw new Error('TTS failed')
    const audioBlob = await res.blob()
    return audioBlob
  }, [])

  const playAudio = useCallback((blob: Blob): Promise<void> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
        resolve()
      }

      audio.onerror = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
        resolve()
      }

      audio.play().catch(() => resolve())
    })
  }, [])

  // Main voice loop: record → transcribe → chat → speak
  const handleMicTap = useCallback(async () => {
    if (state.phase === 'RECORDING') {
      // Stop recording and process
      actions.stopRecording()

      try {
        const blob = await recorder.stopRecording()

        // Transcribe
        const text = await transcribeAudio(blob)
        if (!text.trim()) {
          actions.error('No speech detected. Try again.')
          return
        }
        actions.transcriptionDone(text)

        // Get AI response — need to include the new user message
        const updatedTranscript: TranscriptMessage[] = [
          ...state.transcript,
          { role: 'user', content: text, timestamp: new Date().toISOString() },
        ]
        const aiText = await getChatResponse(updatedTranscript)
        actions.aiResponse(aiText)

        // Speak the response
        actions.startSpeaking()
        try {
          const audioBlob = await speakText(aiText)
          await playAudio(audioBlob)
        } catch (ttsErr) {
          console.error('TTS error:', ttsErr)
        }
        actions.doneSpeaking()
      } catch (err) {
        actions.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    } else if (state.phase === 'READY') {
      // Start recording
      try {
        await recorder.startRecording()
        actions.startRecording()
      } catch (err) {
        actions.error(err instanceof Error ? err.message : 'Microphone access denied')
      }
    }
  }, [state.phase, state.transcript, actions, recorder, transcribeAudio, getChatResponse, speakText, playAudio])

  // End conversation
  const handleEnd = useCallback(async () => {
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    // Stop recording if active
    if (recorder.isRecording) {
      try { await recorder.stopRecording() } catch { /* ignore */ }
    }

    if (state.transcript.length === 0) {
      actions.close()
      setTimeout(() => {
        actions.reset()
        onClose()
      }, 300)
      return
    }

    actions.startCompleting()

    try {
      const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const res = await fetch('/api/brain-dump/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: state.transcript,
          durationSeconds,
        }),
      })

      if (!res.ok) throw new Error('Failed to save')
      const data = await res.json()
      actions.completeDone(data.summary)
    } catch {
      actions.completeDone(null)
    }
  }, [state.transcript, actions, recorder, onClose])

  // Close after completion
  const handleCloseAfterComplete = useCallback(() => {
    actions.reset()
    onClose()
  }, [actions, onClose])

  const getStatusText = () => {
    switch (state.phase) {
      case 'OPENING': return 'Starting up...'
      case 'READY': return 'Tap the mic to speak'
      case 'RECORDING': return 'Listening...'
      case 'TRANSCRIBING': return 'Processing...'
      case 'THINKING': return 'Thinking...'
      case 'SPEAKING': return 'Speaking...'
      case 'COMPLETING': return 'Saving your brain dump...'
      default: return ''
    }
  }

  const isBusy = ['TRANSCRIBING', 'THINKING', 'SPEAKING', 'COMPLETING'].includes(state.phase)
  const canRecord = state.phase === 'READY' || state.phase === 'RECORDING'
  const canEnd = ['READY', 'RECORDING', 'SPEAKING'].includes(state.phase)

  return (
    <AnimatePresence>
      {isOpen && state.phase !== 'IDLE' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <button
              onClick={() => {
                if (state.transcript.length > 0 && state.phase !== 'COMPLETING' && state.phase !== 'CLOSED') {
                  handleEnd()
                } else if (state.phase === 'CLOSED') {
                  handleCloseAfterComplete()
                } else {
                  actions.reset()
                  onClose()
                }
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-semibold text-white">Brain Dump</h2>

            {canEnd && state.transcript.length > 0 ? (
              <button
                onClick={handleEnd}
                className="px-4 py-2 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
              >
                End
              </button>
            ) : (
              <div className="w-16" />
            )}
          </div>

          {/* Completion screen */}
          {state.phase === 'CLOSED' && (
            <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
              <div className="w-16 h-16 rounded-full bg-purple-600/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white">Brain dump saved</h3>
              {state.summary && (
                <p className="text-slate-400 text-center text-sm max-w-sm">{state.summary}</p>
              )}
              <button
                onClick={handleCloseAfterComplete}
                className="mt-4 px-6 py-3 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Main content (not completion screen) */}
          {state.phase !== 'CLOSED' && (
            <>
              {/* Transcript area */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {state.transcript.length === 0 && state.phase === 'READY' && (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-slate-500 text-center text-sm">
                      Tap the mic and start talking.<br />
                      Say whatever&apos;s on your mind.
                    </p>
                  </div>
                )}

                {state.transcript.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.role === 'user'
                          ? 'bg-teal-600/30 text-teal-100'
                          : 'bg-purple-600/30 text-purple-100'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {/* Loading indicator */}
                {(state.phase === 'TRANSCRIBING' || state.phase === 'THINKING') && (
                  <div className="flex justify-start">
                    <div className="bg-purple-600/30 rounded-2xl px-4 py-2.5">
                      <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                    </div>
                  </div>
                )}
              </div>

              {/* Error toast */}
              <AnimatePresence>
                {state.error && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="mx-4 mb-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-300 text-sm text-center"
                  >
                    {state.error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bottom section: waveform + mic */}
              <div className="px-4 pb-8 pt-4 space-y-4">
                {/* Waveform */}
                <VoiceWaveform
                  analyser={recorder.analyserRef.current}
                  isActive={state.phase === 'RECORDING' || state.phase === 'SPEAKING'}
                />

                {/* Status text */}
                <p className="text-center text-sm text-slate-400">{getStatusText()}</p>

                {/* Mic button */}
                <div className="flex justify-center">
                  <button
                    onClick={handleMicTap}
                    disabled={!canRecord && state.phase !== 'RECORDING'}
                    className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                      state.phase === 'RECORDING'
                        ? 'bg-red-500 hover:bg-red-400 scale-110'
                        : isBusy
                        ? 'bg-slate-700 cursor-not-allowed opacity-50'
                        : 'bg-purple-600 hover:bg-purple-500'
                    }`}
                  >
                    {state.phase === 'RECORDING' ? (
                      <Square className="w-8 h-8 text-white" fill="white" />
                    ) : isBusy ? (
                      <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                    ) : state.phase === 'COMPLETING' ? (
                      <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                    ) : canRecord ? (
                      <Mic className="w-8 h-8 text-white" />
                    ) : (
                      <MicOff className="w-8 h-8 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
