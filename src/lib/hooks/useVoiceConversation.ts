'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioRecorder } from '@/components/brain-dump/useAudioRecorder'

const DEFAULT_STORAGE_KEY = 'rise.voice.muted'
const MAX_TTS_CHARS = 520
const LEAD_CHUNK_MAX_CHARS = 150

interface UseVoiceConversationOptions {
  storageKey?: string
}

export function useVoiceConversation(options: UseVoiceConversationOptions = {}) {
  const { storageKey = DEFAULT_STORAGE_KEY } = options
  const recorder = useAudioRecorder()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isRecordingRef = useRef(false)
  const isMutedRef = useRef(false)
  const speechRunRef = useRef(0)
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
    isMutedRef.current = isMuted
  }, [isMuted])

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
    speechRunRef.current += 1
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
    if (isSpeaking) {
      stopSpeaking()
    }
    await startRecording()
    return null
  }, [recorder.isRecording, startRecording, stopRecordingAndTranscribe, isSpeaking, stopSpeaking])

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

  const splitForFastSpeech = useCallback((text: string): [string, string] => {
    const squashed = text.replace(/\s+/g, ' ').trim()
    const bounded =
      squashed.length > MAX_TTS_CHARS
        ? `${squashed.slice(0, MAX_TTS_CHARS).trimEnd()}...`
        : squashed

    if (!bounded) return ['', '']

    const sentenceParts = bounded.split(/(?<=[.!?])\s+/).filter(Boolean)
    if (sentenceParts.length === 0) return [bounded, '']

    let lead = sentenceParts[0]
    let remainder = sentenceParts.slice(1).join(' ').trim()

    if (lead.length > LEAD_CHUNK_MAX_CHARS) {
      lead = `${lead.slice(0, LEAD_CHUNK_MAX_CHARS).trimEnd()}...`
      remainder = bounded.slice(Math.min(bounded.length, lead.length)).trim()
    }

    return [lead, remainder]
  }, [])

  const fetchSpeechBlob = useCallback(async (text: string) => {
    const response = await fetch('/api/brain-dump/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error || 'Text-to-speech failed')
    }

    return response.blob()
  }, [])

  const speakText = useCallback(async (text: string) => {
    const cleanText = text.trim()
    if (!cleanText || isMuted) return false

    setVoiceError(null)
    stopSpeaking()
    setIsSpeaking(true)
    const runId = speechRunRef.current
    const [leadText, remainderText] = splitForFastSpeech(cleanText)

    try {
      // Start remainder synthesis in parallel while the lead sentence plays.
      const remainderBlobPromise = remainderText
        ? fetchSpeechBlob(remainderText).catch(() => null)
        : Promise.resolve<Blob | null>(null)

      if (leadText) {
        const leadBlob = await fetchSpeechBlob(leadText)
        if (speechRunRef.current !== runId || isMutedRef.current) return false
        await playAudio(leadBlob)
      }

      const remainderBlob = await remainderBlobPromise
      if (remainderBlob && speechRunRef.current === runId && !isMutedRef.current) {
        await playAudio(remainderBlob)
      }

      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Text-to-speech failed'
      setVoiceError(message)
      return false
    } finally {
      if (speechRunRef.current === runId) {
        setIsSpeaking(false)
      }
    }
  }, [isMuted, stopSpeaking, splitForFastSpeech, fetchSpeechBlob, playAudio])

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
