'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Moon, TrendingUp, Lock } from 'lucide-react'
import Link from 'next/link'
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

  const supabase = createClient()
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

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
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
        <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 safe-bottom">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-around">
            <Link href="/" className="flex flex-col items-center gap-1 text-slate-400">
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
                <span className="text-xs text-slate-300 font-bold">R</span>
              </div>
              <span className="text-xs">Today</span>
            </Link>
            <Link href="/progress" className="flex flex-col items-center gap-1 text-slate-400">
              <TrendingUp className="w-6 h-6" />
              <span className="text-xs">Progress</span>
            </Link>
            <Link href="/evening" className="flex flex-col items-center gap-1 text-teal-400">
              <Moon className="w-6 h-6" />
              <span className="text-xs">Evening</span>
            </Link>
          </div>
        </nav>
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
                One thing you're grateful for
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                Even small things count. +30 XP
              </p>
              <textarea
                value={gratitude}
                onChange={(e) => setGratitude(e.target.value)}
                placeholder="Today I'm grateful for..."
                className="w-full p-4 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                rows={3}
              />
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
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center text-teal-400"
                >
                  Saved! Rest well tonight.
                </motion.p>
              )}
            </AnimatePresence>
          </>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 safe-bottom">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-around">
          <Link href="/" className="flex flex-col items-center gap-1 text-slate-400">
            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
              <span className="text-xs text-slate-300 font-bold">R</span>
            </div>
            <span className="text-xs">Today</span>
          </Link>
          <Link href="/progress" className="flex flex-col items-center gap-1 text-slate-400">
            <TrendingUp className="w-6 h-6" />
            <span className="text-xs">Progress</span>
          </Link>
          <Link href="/evening" className="flex flex-col items-center gap-1 text-teal-400">
            <Moon className="w-6 h-6" />
            <span className="text-xs">Evening</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
