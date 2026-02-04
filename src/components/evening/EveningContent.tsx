'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Moon, Lock, Sparkles } from 'lucide-react'
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

export function EveningContent({ profile, todayLog }: EveningContentProps) {
  const [eveningEnergy, setEveningEnergy] = useState(todayLog?.evening_energy || 5)
  const [eveningMood, setEveningMood] = useState(todayLog?.evening_mood || 5)
  const [dayRating, setDayRating] = useState(todayLog?.day_rating || 5)
  const [gratitude, setGratitude] = useState(todayLog?.gratitude_entry || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [earnedXP, setEarnedXP] = useState(0)

  const supabase = createClient()

  const MAX_GRATITUDE_LENGTH = 280
  const gratitudeLength = gratitude.length
  const isNearLimit = gratitudeLength >= MAX_GRATITUDE_LENGTH * 0.8
  const isAtLimit = gratitudeLength >= MAX_GRATITUDE_LENGTH

  const gratitudeCharacterInfo = useMemo(() => {
    const remaining = MAX_GRATITUDE_LENGTH - gratitudeLength
    if (gratitudeLength === 0) return { text: 'Start writing to earn +30 XP', color: 'text-slate-500' }
    if (isAtLimit) return { text: 'Character limit reached', color: 'text-amber-400' }
    if (isNearLimit) return { text: `${remaining} characters left`, color: 'text-amber-400' }
    return { text: `${remaining} characters left`, color: 'text-slate-500' }
  }, [gratitudeLength, isAtLimit, isNearLimit])
  const tier = profile?.unlock_tier || 1

  // Tier 3+ unlocks evening reflection
  const isUnlocked = tier >= 3

  const handleSave = async () => {
    if (!todayLog) return

    setSaving(true)
    try {
      let xpBonus = 0

      // Check if first submission
      if (!todayLog.evening_energy && !todayLog.evening_mood) {
        xpBonus = 25 // Evening check-in XP
      }
      if (!todayLog.gratitude_entry && gratitude.trim()) {
        xpBonus += 30 // Gratitude XP
      }
      if (!todayLog.day_rating) {
        xpBonus += 10 // Day rating XP
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('daily_logs')
        .update({
          evening_energy: eveningEnergy,
          evening_mood: eveningMood,
          day_rating: dayRating,
          gratitude_entry: gratitude.trim() || null,
          xp_earned: todayLog.xp_earned + xpBonus,
        })
        .eq('id', todayLog.id)

      if (xpBonus > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc('increment_xp', {
          user_id: profile?.id,
          xp_amount: xpBonus,
        })
      }

      setEarnedXP(xpBonus)
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        setEarnedXP(0)
      }, 4000)
    } finally {
      setSaving(false)
    }
  }

  if (!isUnlocked) {
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
            <h1 className="text-xl font-bold text-slate-100">Evening Reflection</h1>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6">
          <Card className="text-center py-12">
            <Lock className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h2 className="text-xl font-semibold text-slate-200 mb-2">
              Locked Feature
            </h2>
            <p className="text-slate-400 mb-4">
              Evening reflection unlocks at Tier 3 (1,500 XP)
            </p>
            <p className="text-sm text-slate-500">
              Current: {profile?.total_xp?.toLocaleString() || 0} XP
            </p>
          </Card>
        </main>

        {/* Bottom nav */}
        <div className="fixed bottom-0 left-0 right-0">
          <BottomNavigation />
        </div>
      </div>
    )
  }

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
          <h1 className="text-xl font-bold text-slate-100">Evening Reflection</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {!todayLog?.im_up_pressed_at ? (
          <Card className="text-center py-8">
            <Moon className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">
              Complete your morning check-in first to unlock evening reflection.
            </p>
            <Link href="/">
              <Button className="mt-4" variant="secondary">
                Go to Morning Check-in
              </Button>
            </Link>
          </Card>
        ) : (
          <>
            {/* Evening Mood */}
            <Card>
              <h3 className="text-lg font-semibold text-slate-200 mb-4">
                How did your day end?
              </h3>

              <div className="space-y-6">
                <Slider
                  label="Evening Energy"
                  value={eveningEnergy}
                  onChange={setEveningEnergy}
                  min={1}
                  max={10}
                  leftLabel="Drained"
                  rightLabel="Energized"
                />

                <Slider
                  label="Evening Mood"
                  value={eveningMood}
                  onChange={setEveningMood}
                  min={1}
                  max={10}
                  leftLabel="Low"
                  rightLabel="Great"
                />
              </div>
            </Card>

            {/* Day Rating */}
            <Card>
              <h3 className="text-lg font-semibold text-slate-200 mb-4">
                Rate your day
              </h3>
              <Slider
                value={dayRating}
                onChange={setDayRating}
                min={1}
                max={10}
                leftLabel="Tough day"
                rightLabel="Great day"
              />
            </Card>

            {/* Gratitude */}
            <Card>
              <h3 className="text-lg font-semibold text-slate-200 mb-2">
                One thing you&apos;re grateful for
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                Even small things count. +30 XP
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
                  className={`w-full p-4 bg-slate-800 border rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none transition-colors ${
                    isAtLimit ? 'border-amber-500/50' : 'border-slate-700'
                  }`}
                  rows={3}
                  maxLength={MAX_GRATITUDE_LENGTH}
                  aria-describedby="gratitude-counter"
                />
                <div
                  id="gratitude-counter"
                  className={`flex items-center justify-between mt-2 text-xs transition-colors ${gratitudeCharacterInfo.color}`}
                >
                  <span>{gratitudeCharacterInfo.text}</span>
                  <span className={`tabular-nums ${isNearLimit ? 'font-medium' : ''}`}>
                    {gratitudeLength}/{MAX_GRATITUDE_LENGTH}
                  </span>
                </div>
              </div>
            </Card>

            {/* Save Button */}
            <Button
              onClick={handleSave}
              isLoading={saving}
              className="w-full"
              size="lg"
            >
              Save Evening Reflection
            </Button>

            <AnimatePresence>
              {saved && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col items-center gap-2"
                >
                  <p className="text-center text-teal-400 font-medium">
                    Saved! Rest well tonight.
                  </p>
                  {earnedXP > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/10 border border-teal-500/20 rounded-full"
                    >
                      <Sparkles className="w-4 h-4 text-teal-400" />
                      <span className="text-sm font-semibold text-teal-300">+{earnedXP} XP</span>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </main>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0">
        <BottomNavigation />
      </div>
    </div>
  )
}
