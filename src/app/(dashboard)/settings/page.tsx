'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, LogOut, User, Bell, Shield, Heart, RotateCcw, Clock } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useUser } from '@/lib/hooks/useUser'

export default function SettingsPage() {
  const { user, profile, signOut } = useUser()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const [comingSoonToast, setComingSoonToast] = useState<string | null>(null)

  const showComingSoon = useCallback((feature: string) => {
    setComingSoonToast(feature)
    setTimeout(() => setComingSoonToast(null), 2500)
  }, [])

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut()
    router.push('/login')
  }

  const handleResetToday = async () => {
    if (!confirm('This will reset your "I\'m Up" button and morning check-in for today. Continue?')) {
      return
    }
    setResetting(true)
    setResetMessage(null)
    try {
      const res = await fetch('/api/reset-today', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setResetMessage('Reset successful! Refreshing...')
        setTimeout(() => {
          router.push('/')
          router.refresh()
        }, 1000)
      } else {
        setResetMessage('Reset failed. Please try again.')
      }
    } catch {
      setResetMessage('Reset failed. Please try again.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-8">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-full hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Profile */}
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                {profile?.display_name || 'User'}
              </h2>
              <p className="text-sm text-slate-400">{user?.email}</p>
              <p className="text-sm text-teal-400">
                Level {profile?.current_level || 1} · {profile?.total_xp?.toLocaleString() || 0} XP
              </p>
            </div>
          </div>
        </Card>

        {/* Settings sections */}
        <Card>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
            Preferences
          </h3>

          <div className="space-y-3">
            <button
              onClick={() => showComingSoon('Notifications')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/30 transition-colors text-left group"
            >
              <Bell className="w-5 h-5 text-slate-500" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-slate-400">Notifications</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    Soon
                  </span>
                </div>
                <p className="text-sm text-slate-600">Morning reminders</p>
              </div>
            </button>

            <button
              onClick={() => showComingSoon('Privacy settings')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/30 transition-colors text-left group"
            >
              <Shield className="w-5 h-5 text-slate-500" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-slate-400">Privacy</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    Soon
                  </span>
                </div>
                <p className="text-sm text-slate-600">Data and sharing</p>
              </div>
            </button>

            <button
              onClick={() => showComingSoon('Partner Sharing')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/30 transition-colors text-left group"
            >
              <Heart className="w-5 h-5 text-slate-500" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-slate-400">Partner Sharing</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    Soon
                  </span>
                </div>
                <p className="text-sm text-slate-600">Share progress with someone</p>
              </div>
            </button>
          </div>
        </Card>

        {/* Support info */}
        <Card>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
            Support
          </h3>
          <p className="text-slate-300 text-sm mb-3">
            Rise is designed to support your recovery, but it&apos;s not a replacement for professional help.
          </p>
          <p className="text-slate-400 text-sm">
            If you&apos;re struggling, please reach out to a mental health professional or call a crisis helpline.
          </p>
        </Card>

        {/* Tools */}
        <Card>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
            Tools
          </h3>
          <button
            onClick={handleResetToday}
            disabled={resetting}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-left disabled:opacity-50"
          >
            <RotateCcw className={`w-5 h-5 text-slate-400 ${resetting ? 'animate-spin' : ''}`} />
            <div className="flex-1">
              <p className="text-slate-200">Reset Today</p>
              <p className="text-sm text-slate-500">
                {resetMessage || 'Reset your morning check-in'}
              </p>
            </div>
          </button>
        </Card>

        {/* Sign out */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Button
            onClick={handleSignOut}
            isLoading={signingOut}
            variant="danger"
            className="w-full"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </motion.div>

        {/* App info */}
        <p className="text-center text-sm text-slate-600">
          Rise v1.0.0 · Made with care
        </p>
      </main>

      {/* Coming Soon Toast */}
      <AnimatePresence>
        {comingSoonToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 shadow-lg">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-400" />
                <span className="text-sm text-slate-200">
                  {comingSoonToast} coming soon!
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
