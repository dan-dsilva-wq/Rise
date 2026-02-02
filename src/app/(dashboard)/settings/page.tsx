'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, LogOut, User, Bell, Shield, Heart } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useUser } from '@/lib/hooks/useUser'

export default function SettingsPage() {
  const { user, profile, signOut } = useUser()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut()
    router.push('/login')
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
            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-left">
              <Bell className="w-5 h-5 text-slate-400" />
              <div className="flex-1">
                <p className="text-slate-200">Notifications</p>
                <p className="text-sm text-slate-500">Morning reminders</p>
              </div>
            </button>

            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-left">
              <Shield className="w-5 h-5 text-slate-400" />
              <div className="flex-1">
                <p className="text-slate-200">Privacy</p>
                <p className="text-sm text-slate-500">Data and sharing</p>
              </div>
            </button>

            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors text-left">
              <Heart className="w-5 h-5 text-slate-400" />
              <div className="flex-1">
                <p className="text-slate-200">Partner Sharing</p>
                <p className="text-sm text-slate-500">Share progress with someone</p>
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
            Rise is designed to support your recovery, but it's not a replacement for professional help.
          </p>
          <p className="text-slate-400 text-sm">
            If you're struggling, please reach out to a mental health professional or call a crisis helpline.
          </p>
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
    </div>
  )
}
