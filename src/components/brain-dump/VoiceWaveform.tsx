'use client'

import { useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'

interface VoiceWaveformProps {
  analyser: AnalyserNode | null
  isActive: boolean
  barCount?: number
}

export function VoiceWaveform({ analyser, isActive, barCount = 24 }: VoiceWaveformProps) {
  const barsRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)
  const fallbackHeights = useMemo(
    () => Array.from({ length: barCount }, (_, index) => 16 + ((index * 11) % 24)),
    [barCount]
  )
  const fallbackDurations = useMemo(
    () => Array.from({ length: barCount }, (_, index) => 0.6 + ((index * 7) % 5) * 0.08),
    [barCount]
  )

  useEffect(() => {
    if (!analyser || !isActive || !barsRef.current) return

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const bars = barsRef.current.children

    const animate = () => {
      analyser.getByteFrequencyData(dataArray)

      const step = Math.floor(dataArray.length / barCount)
      for (let i = 0; i < bars.length; i++) {
        const value = dataArray[i * step] || 0
        const height = Math.max(4, (value / 255) * 48)
        ;(bars[i] as HTMLElement).style.height = `${height}px`
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationRef.current)
    }
  }, [analyser, isActive, barCount])

  // Fallback pulsing animation when no analyser
  if (!analyser) {
    return (
      <div className="flex items-center justify-center gap-1 h-12">
        {Array.from({ length: barCount }).map((_, i) => (
          <motion.div
            key={i}
            className="w-1 rounded-full bg-purple-400/60"
            animate={
              isActive
                ? {
                    height: [4, fallbackHeights[i], 4],
                  }
                : { height: 4 }
            }
            transition={
              isActive
                ? {
                    duration: fallbackDurations[i],
                    repeat: Infinity,
                    delay: i * 0.05,
                    ease: 'easeInOut',
                  }
                : { duration: 0.3 }
            }
          />
        ))}
      </div>
    )
  }

  return (
    <div ref={barsRef} className="flex items-center justify-center gap-1 h-12">
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className="w-1 rounded-full bg-purple-400/60 transition-[height] duration-75"
          style={{ height: '4px' }}
        />
      ))}
    </div>
  )
}
