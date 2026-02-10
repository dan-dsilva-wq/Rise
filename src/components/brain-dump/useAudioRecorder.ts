import { useRef, useCallback, useState } from 'react'

export function useAudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const [isRecording, setIsRecording] = useState(false)

  const getMimeType = useCallback(() => {
    // Safari doesn't support webm — fall back to mp4
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      return 'audio/webm;codecs=opus'
    }
    if (MediaRecorder.isTypeSupported('audio/mp4')) {
      return 'audio/mp4'
    }
    return 'audio/webm'
  }, [])

  const startRecording = useCallback(async (): Promise<AnalyserNode | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Set up AnalyserNode for waveform visualization
      let analyser: AnalyserNode | null = null
      try {
        const audioContext = new AudioContext()
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)
        analyserRef.current = analyser
      } catch {
        // AnalyserNode not critical — waveform falls back to pulsing animation
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

      mediaRecorder.start(100) // Collect data every 100ms
      setIsRecording(true)

      return analyser
    } catch (err) {
      console.error('Failed to start recording:', err)
      throw new Error('Microphone access denied')
    }
  }, [getMimeType])

  const stopRecording = useCallback((): Promise<Blob> => {
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

        // Stop all tracks to release mic
        streamRef.current?.getTracks().forEach(track => track.stop())
        streamRef.current = null
        analyserRef.current = null

        resolve(blob)
      }

      mediaRecorder.stop()
    })
  }, [])

  return {
    isRecording,
    startRecording,
    stopRecording,
    analyserRef,
  }
}
