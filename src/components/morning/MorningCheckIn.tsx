'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Sparkles, ChevronRight } from 'lucide-react'
import { Slider } from '@/components/ui/Slider'

interface MorningCheckInProps {
  displayName: string | null
  onComplete: (data: { mood: number; energy: number }) => void
}

const getEnergyEmoji = (value: number): string => {
  if (value <= 2) return '😴'
  if (value <= 4) return '😐'
  if (value <= 6) return '🙂'
  if (value <= 8) return '😊'
  return '⚡'
}

const getMoodEmoji = (value: number): string => {
  if (value <= 2) return '😢'
  if (value <= 4) return '😔'
  if (value <= 6) return '😐'
  if (value <= 8) return '🙂'
  return '😄'
}

export function MorningCheckIn({ displayName, onComplete }: MorningCheckInProps) {
  const [step, setStep] = useState<'mood' | 'energy' | 'submitting' | 'done'>('mood')
  const [mood, setMood] = useState(5)
  const [energy, setEnergy] = useState(5)
  const [moodTouched, setMoodTouched] = useState(false)
  const [energyTouched, setEnergyTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name = displayName || 'there'

  const handleNext = () => {
    if (step === 'mood') {
      setStep('energy')
    } else if (step === 'energy') {
      submitCheckIn()
    }
  }

  const submitCheckIn = async () => {
    setStep('submitting')
    setError(null)

    try {
      const response = await fetch('/api/morning-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood,
          energy,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save check-in')
      }

      setStep('done')
      // Small delay to show completion state before hiding
      setTimeout(() => onComplete({ mood, energy }), 800)
    } catch (err) {
      console.error('Morning check-in error:', err)
      setError('Could not save your check-in. Tap to retry.')
      setStep('energy')
    }
  }

  const canProceed = step === 'mood' ? moodTouched : energyTouched

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20, height: 0 }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-900/30 via-slate-800 to-orange-900/20 border border-amber-500/20"
    >
      {/* Warm gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400" />

      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-full bg-amber-500/20">
            <Sun className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              {greeting}, {name}
            </h2>
            <p className="text-sm text-slate-400">How are you feeling?</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 'mood' && (
            <motion.div
              key="mood"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-3xl">{getMoodEmoji(mood)}</span>
                  <span className="text-slate-300 font-medium">How is your mood?</span>
                </div>
                <Slider
                  value={mood}
                  onChange={setMood}
                  min={1}
                  max={10}
                  leftLabel="Rough"
                  rightLabel="Great"
                  touched={moodTouched}
                  onTouch={() => setMoodTouched(true)}
                />
              </div>

              <button
                onClick={handleNext}
                disabled={!canProceed}
                className={`w-full py-4 rounded-2xl font-semibold text-lg flex items-center justify-center gap-2 transition-all ${
                  canProceed
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg hover:shadow-amber-500/25'
                    : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                }`}
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {step === 'energy' && (
            <motion.div
              key="energy"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-3xl">{getEnergyEmoji(energy)}</span>
                  <span className="text-slate-300 font-medium">How is your energy?</span>
                </div>
                <Slider
                  value={energy}
                  onChange={setEnergy}
                  min={1}
                  max={10}
                  leftLabel="Exhausted"
                  rightLabel="Energized"
                  touched={energyTouched}
                  onTouch={() => setEnergyTouched(true)}
                />
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-red-400 text-center"
                >
                  {error}
                </motion.p>
              )}

              <button
                onClick={handleNext}
                disabled={!canProceed}
                className={`w-full py-4 rounded-2xl font-semibold text-lg flex items-center justify-center gap-2 transition-all ${
                  canProceed
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg hover:shadow-amber-500/25'
                    : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                }`}
              >
                Save Check-In
                <Sparkles className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {step === 'submitting' && (
            <motion.div
              key="submitting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-8 text-center"
            >
              <div className="inline-flex items-center gap-3 text-slate-300">
                <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </div>
            </motion.div>
          )}

          {step === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-teal-500/20 mb-3"
              >
                <Sparkles className="w-7 h-7 text-teal-400" />
              </motion.div>
              <p className="text-slate-200 font-medium">You are checked in</p>
              <p className="text-sm text-slate-500 mt-1">Let&apos;s make today count</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
