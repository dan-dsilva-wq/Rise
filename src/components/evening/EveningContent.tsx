'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Moon, Heart, X } from 'lucide-react'
import Link from 'next/link'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { Slider } from '@/components/ui/Slider'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { createClient } from '@/lib/supabase/client'
import type { Profile, DailyLog } from '@/lib/supabase/types'

interface EveningContentProps {
  profile: Profile | null
  todayLog: DailyLog | null
}

/**
 * Generate a warm, personalized closing message based on the user's day.
 * No AI call needed — we use their own data to reflect back what they shared.
 */
function generateClosingMessage(
  eveningMood: number,
  eveningEnergy: number,
  dayRating: number,
  morningMood: number | null,
  morningEnergy: number | null,
  gratitude: string,
  displayName: string | null
): string {
  const name = displayName || 'there'

  // Mood improved through the day
  if (morningMood && eveningMood > morningMood + 2) {
    return `Your mood really lifted today, ${name}. Whatever you did — keep that thread. Days like this build on each other.`
  }

  // Tough day but they still showed up to reflect
  if (dayRating <= 3) {
    if (gratitude.trim()) {
      return `Rough day, but you still found something to be grateful for. That takes real strength, ${name}. Tomorrow is a clean slate.`
    }
    return `Not every day will be easy, ${name}. But you showed up tonight to check in with yourself — that matters more than you think. Rest well.`
  }

  // Energy crashed through the day
  if (morningEnergy && eveningEnergy < morningEnergy - 3) {
    return `Sounds like today took a lot out of you. That's okay — it usually means you gave it real effort. Let yourself recharge tonight, ${name}.`
  }

  // Great day
  if (dayRating >= 8 && eveningMood >= 7) {
    return `What a day, ${name}. Hold onto this feeling — this is what momentum looks like. See you tomorrow.`
  }

  // Good day
  if (dayRating >= 6) {
    if (gratitude.trim()) {
      return `A solid day, and you took a moment to appreciate it. That's the kind of awareness that compounds over time, ${name}. Rest well.`
    }
    return `Good day, ${name}. Every day you reflect like this, you're building a clearer picture of what works for you. Sleep well.`
  }

  // Average/neutral day
  if (gratitude.trim()) {
    return `Even on a quiet day, you found something worth appreciating. That's a good sign, ${name}. See you in the morning.`
  }

  return `Thanks for checking in tonight, ${name}. The fact that you're here, reflecting — that's how clarity builds, one day at a time. Rest well.`
}

export function EveningContent({ profile, todayLog }: EveningContentProps) {
  const [eveningEnergy, setEveningEnergy] = useState(todayLog?.evening_energy || 5)
  const [eveningMood, setEveningMood] = useState(todayLog?.evening_mood || 5)
  const [dayRating, setDayRating] = useState(todayLog?.day_rating || 5)
  const [gratitude, setGratitude] = useState(todayLog?.gratitude_entry || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [closingMessage, setClosingMessage] = useState('')
  const [errorToast, setErrorToast] = useState<string | null>(null)

  // Track which sliders have been intentionally touched
  const [touchedSliders, setTouchedSliders] = useState({
    energy: !!todayLog?.evening_energy,
    mood: !!todayLog?.evening_mood,
    rating: !!todayLog?.day_rating,
  })

  const supabase = createClient()

  const MAX_GRATITUDE_LENGTH = 280
  const gratitudeLength = gratitude.length
  const isNearLimit = gratitudeLength >= MAX_GRATITUDE_LENGTH * 0.8
  const isAtLimit = gratitudeLength >= MAX_GRATITUDE_LENGTH

  const gratitudeCharacterInfo = useMemo(() => {
    const remaining = MAX_GRATITUDE_LENGTH - gratitudeLength
    if (gratitudeLength === 0) return { text: '', color: 'text-slate-500' }
    if (isAtLimit) return { text: 'Character limit reached', color: 'text-amber-400' }
    if (isNearLimit) return { text: `${remaining} characters left`, color: 'text-amber-400' }
    return { text: `${remaining} characters left`, color: 'text-slate-500' }
  }, [gratitudeLength, isAtLimit, isNearLimit])

  const handleSave = async () => {
    if (!todayLog) return

    setSaving(true)
    setErrorToast(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('daily_logs')
        .update({
          evening_energy: eveningEnergy,
          evening_mood: eveningMood,
          day_rating: dayRating,
          gratitude_entry: gratitude.trim() || null,
        })
        .eq('id', todayLog.id)

      if (updateError) {
        throw new Error('Failed to save reflection')
      }

      // Generate a warm closing message based on what they shared
      const message = generateClosingMessage(
        eveningMood,
        eveningEnergy,
        dayRating,
        todayLog.morning_mood,
        todayLog.morning_energy,
        gratitude,
        profile?.display_name || null
      )
      setClosingMessage(message)
      setSaved(true)
    } catch {
      setErrorToast('Failed to save. Please try again.')
      setTimeout(() => setErrorToast(null), 5000)
    } finally {
      setSaving(false)
    }
  }

  // Determine time-aware greeting
  const hour = new Date().getHours()
  const timeGreeting = hour >= 21
    ? 'Winding down?'
    : hour >= 18
    ? 'How was your day?'
    : 'Taking a moment to reflect?'

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-full hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Evening Reflection</h1>
            <p className="text-sm text-slate-500">{timeGreeting}</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {!todayLog ? (
          <Card className="text-center py-8">
            <Moon className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">
              No log for today yet. Start your day first, then come back tonight to reflect.
            </p>
            <Link href="/">
              <Button className="mt-4" variant="secondary">
                Go to Today
              </Button>
            </Link>
          </Card>
        ) : saved ? (
          /* Post-save: Warm closing message */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900/30 via-slate-800 to-purple-900/30 border border-indigo-500/20 shadow-xl">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50" />

              <div className="p-8 text-center space-y-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                >
                  <Moon className="w-12 h-12 mx-auto text-indigo-400" />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <h2 className="text-2xl font-bold text-white mb-4">
                    Reflection saved
                  </h2>
                  <p className="text-slate-300 leading-relaxed text-lg">
                    {closingMessage}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  <Link href="/">
                    <Button variant="secondary" className="mt-4">
                      Back to Today
                    </Button>
                  </Link>
                </motion.div>
              </div>
            </div>
          </motion.div>
        ) : (
          <>
            {/* Evening Mood */}
            <Card>
              <h3 className="text-lg font-semibold text-slate-200 mb-4">
                How are you feeling right now?
              </h3>

              <div className="space-y-6">
                <Slider
                  label="Energy"
                  value={eveningEnergy}
                  onChange={setEveningEnergy}
                  min={1}
                  max={10}
                  leftLabel="Drained"
                  rightLabel="Energized"
                  touched={touchedSliders.energy}
                  onTouch={() => setTouchedSliders((prev) => ({ ...prev, energy: true }))}
                />

                <Slider
                  label="Mood"
                  value={eveningMood}
                  onChange={setEveningMood}
                  min={1}
                  max={10}
                  leftLabel="Low"
                  rightLabel="Great"
                  touched={touchedSliders.mood}
                  onTouch={() => setTouchedSliders((prev) => ({ ...prev, mood: true }))}
                />
              </div>
            </Card>

            {/* Day Rating */}
            <Card>
              <h3 className="text-lg font-semibold text-slate-200 mb-4">
                How would you rate today?
              </h3>
              <Slider
                label="Overall"
                value={dayRating}
                onChange={setDayRating}
                min={1}
                max={10}
                leftLabel="Tough day"
                rightLabel="Great day"
                touched={touchedSliders.rating}
                onTouch={() => setTouchedSliders((prev) => ({ ...prev, rating: true }))}
              />
            </Card>

            {/* Gratitude */}
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <Heart className="w-4 h-4 text-pink-400" />
                <h3 className="text-lg font-semibold text-slate-200">
                  One thing you&apos;re grateful for
                </h3>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Even something small. It shifts your perspective.
              </p>
              <div className="relative">
                <textarea
                  value={gratitude}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_GRATITUDE_LENGTH) {
                      setGratitude(e.target.value)
                    }
                  }}
                  placeholder="Today I'm grateful for..."
                  className={`w-full p-4 bg-slate-800 border rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-colors ${
                    isAtLimit ? 'border-amber-500/50' : 'border-slate-700'
                  }`}
                  rows={3}
                  maxLength={MAX_GRATITUDE_LENGTH}
                  aria-describedby="gratitude-counter"
                />
                {gratitudeLength > 0 && (
                  <div
                    id="gratitude-counter"
                    className={`flex items-center justify-between mt-2 text-xs transition-colors ${gratitudeCharacterInfo.color}`}
                  >
                    <span>{gratitudeCharacterInfo.text}</span>
                    <span className={`tabular-nums ${isNearLimit ? 'font-medium' : ''}`}>
                      {gratitudeLength}/{MAX_GRATITUDE_LENGTH}
                    </span>
                  </div>
                )}
              </div>
            </Card>

            {/* Save Button */}
            <Button
              onClick={handleSave}
              isLoading={saving}
              className="w-full"
              size="lg"
            >
              Save Reflection
            </Button>
          </>
        )}

        {/* Error Toast */}
        <AnimatePresence>
          {errorToast && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-28 left-4 right-4 max-w-lg mx-auto px-4 py-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2"
            >
              <X className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-400 flex-1">{errorToast}</span>
              <button
                onClick={() => setErrorToast(null)}
                className="text-red-400 hover:text-red-300"
                aria-label="Dismiss error"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0">
        <BottomNavigation />
      </div>
    </div>
  )
}
