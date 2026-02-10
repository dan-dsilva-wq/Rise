'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioRecorder } from '@/components/brain-dump/useAudioRecorder'

const DEFAULT_STORAGE_KEY = 'rise.voice.muted'

interface UseVoiceConversationOptions {
  storageKey?: string
}

export function useVoiceConversation(options: UseVoiceConversationOptions = {}) {
  const { storageKey = DEFAULT_STORAGE_KEY } = options
  const recorder = useAudioRecorder()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isRecordingRef = useRef(false)
  const stopRecordingRef = useRef(recorder.stopRecording)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(storageKey)
    if (stored === 'true') {
      setIsMuted(true)
    }
  }, [storageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, isMuted ? 'true' : 'false')
  }, [isMuted, storageKey])

  useEffect(() => {
    isRecordingRef.current = recorder.isRecording
  }, [recorder.isRecording])

  useEffect(() => {
    stopRecordingRef.current = recorder.stopRecording
  }, [recorder.stopRecording])

  const clearVoiceError = useCallback(() => {
    setVoiceError(null)
  }, [])

  const stopSpeaking = useCallback(() => {
    if (!audioRef.current) return
    audioRef.current.pause()
    audioRef.current = null
    setIsSpeaking(false)
  }, [])

  useEffect(() => {
    return () => {
      stopSpeaking()
      if (isRecordingRef.current) {
        void stopRecordingRef.current().catch(() => null)
      }
    }
  }, [stopSpeaking])

  const transcribeAudio = useCallback(async (blob: Blob) => {
    const formData = new FormData()
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
    formData.append('audio', blob, `recording.${ext}`)

    const response = await fetch('/api/brain-dump/transcribe', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error || 'Transcription failed')
    }

    const data = await response.json() as { text?: string }
    return (data.text || '').trim()
  }, [])

  const startRecording = useCallback(async () => {
    setVoiceError(null)
    try {
      await recorder.startRecording()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Microphone access denied'
      setVoiceError(message)
    }
  }, [recorder])

  const stopRecordingAndTranscribe = useCallback(async () => {
    if (!recorder.isRecording) return null

    setVoiceError(null)
    setIsTranscribing(true)

    try {
      const blob = await recorder.stopRecording()
      const transcript = await transcribeAudio(blob)
      if (!transcript) {
        throw new Error('No speech detected. Try again.')
      }
      return transcript
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to transcribe audio'
      setVoiceError(message)
      return null
    } finally {
      setIsTranscribing(false)
    }
  }, [recorder, transcribeAudio])

  const toggleRecordingAndTranscribe = useCallback(async () => {
    if (recorder.isRecording) {
      return stopRecordingAndTranscribe()
    }
    await startRecording()
    return null
  }, [recorder.isRecording, startRecording, stopRecordingAndTranscribe])

  const playAudio = useCallback(async (blob: Blob) => {
    const url = URL.createObjectURL(blob)
    try {
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => {
          audioRef.current = null
          resolve()
        }
        audio.onerror = () => {
          audioRef.current = null
          reject(new Error('Unable to play audio'))
        }
        audio.play().catch(reject)
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  }, [])

  const speakText = useCallback(async (text: string) => {
    const cleanText = text.trim()
    if (!cleanText || isMuted) return false

    setVoiceError(null)
    stopSpeaking()
    setIsSpeaking(true)

    try {
      const response = await fetch('/api/brain-dump/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error || 'Text-to-speech failed')
      }

      const audioBlob = await response.blob()
      await playAudio(audioBlob)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Text-to-speech failed'
      setVoiceError(message)
      return false
    } finally {
      setIsSpeaking(false)
    }
  }, [isMuted, playAudio, stopSpeaking])

  const toggleMute = useCallback(() => {
    setVoiceError(null)
    setIsMuted((prev) => {
      const next = !prev
      if (next) {
        stopSpeaking()
      }
      return next
    })
  }, [stopSpeaking])

  return {
    isRecording: recorder.isRecording,
    isTranscribing,
    isSpeaking,
    isMuted,
    voiceError,
    startRecording,
    stopRecordingAndTranscribe,
    toggleRecordingAndTranscribe,
    speakText,
    stopSpeaking,
    toggleMute,
    clearVoiceError,
  }
}
