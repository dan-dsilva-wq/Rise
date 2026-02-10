import { useRef, useCallback, useState } from 'react'

const SILENCE_THRESHOLD = 15 // Audio level below this = silence (0-255 scale)
const SILENCE_DURATION_MS = 1500 // How long silence must last before auto-stop
const MIN_RECORDING_MS = 1000 // Don't auto-stop before this (avoid false triggers)

export function useAudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vadFrameRef = useRef<number>(0)
  const recordingStartRef = useRef<number>(0)
  const onSilenceRef = useRef<(() => void) | null>(null)
  const [isRecording, setIsRecording] = useState(false)

  const getMimeType = useCallback(() => {
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      return 'audio/webm;codecs=opus'
    }
    if (MediaRecorder.isTypeSupported('audio/mp4')) {
      return 'audio/mp4'
    }
    return 'audio/webm'
  }, [])

  const stopSilenceDetection = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (vadFrameRef.current) {
      cancelAnimationFrame(vadFrameRef.current)
      vadFrameRef.current = 0
    }
  }, [])

  const startSilenceDetection = useCallback((analyser: AnalyserNode) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    let isSilent = false

    const checkLevel = () => {
      analyser.getByteFrequencyData(dataArray)

      // Average volume level
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i]
      }
      const average = sum / dataArray.length

      const elapsed = Date.now() - recordingStartRef.current

      if (average < SILENCE_THRESHOLD && elapsed > MIN_RECORDING_MS) {
        if (!isSilent) {
          isSilent = true
          silenceTimerRef.current = setTimeout(() => {
            // Silence lasted long enough — auto-stop
            onSilenceRef.current?.()
          }, SILENCE_DURATION_MS)
        }
      } else {
        isSilent = false
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
      }

      vadFrameRef.current = requestAnimationFrame(checkLevel)
    }

    vadFrameRef.current = requestAnimationFrame(checkLevel)
  }, [])

  const startRecording = useCallback(async (onSilence?: () => void): Promise<AnalyserNode | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      onSilenceRef.current = onSilence || null
      recordingStartRef.current = Date.now()

      let analyser: AnalyserNode | null = null
      try {
        const audioContext = new AudioContext()
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)
        analyserRef.current = analyser

        // Start silence detection if callback provided
        if (onSilence) {
          startSilenceDetection(analyser)
        }
      } catch {
        // AnalyserNode not critical
      }

      const mimeType = getMimeType()
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.start(100)
      setIsRecording(true)

      return analyser
    } catch (err) {
      console.error('Failed to start recording:', err)
      throw new Error('Microphone access denied')
    }
  }, [getMimeType, startSilenceDetection])

  const stopRecording = useCallback((): Promise<Blob> => {
    stopSilenceDetection()
    onSilenceRef.current = null

    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        reject(new Error('No active recording'))
        return
      }

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        chunksRef.current = []
        setIsRecording(false)

        streamRef.current?.getTracks().forEach(track => track.stop())
        streamRef.current = null
        analyserRef.current = null

        resolve(blob)
      }

      mediaRecorder.stop()
    })
  }, [stopSilenceDetection])

  return {
    isRecording,
    startRecording,
    stopRecording,
    analyserRef,
  }
}
