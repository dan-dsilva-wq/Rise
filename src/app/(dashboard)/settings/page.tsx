'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  LogOut,
  User,
  Bell,
  Shield,
  Heart,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useUser } from '@/lib/hooks/useUser'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'
import type { CapabilityAudience } from '@/lib/path-finder/app-capabilities'

const HAS_VAPID_PUBLIC_KEY = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)

export default function SettingsPage() {
  const { user, profile, signOut } = useUser()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const [comingSoonToast, setComingSoonToast] = useState<string | null>(null)
  const [notificationToast, setNotificationToast] = useState<string | null>(null)
  const [capabilityAudience, setCapabilityAudience] = useState<CapabilityAudience>('general')
  const [capabilitySnapshot, setCapabilitySnapshot] = useState<string | null>(null)
  const [capabilityLoading, setCapabilityLoading] = useState(false)
  const [capabilityError, setCapabilityError] = useState<string | null>(null)
  const [showCapabilitySnapshot, setShowCapabilitySnapshot] = useState(false)

  const {
    supported,
    permission,
    subscribed,
    serverCount,
    latestUpdatedAt,
    loading: notificationsLoading,
    syncing,
    testing,
    error: notificationsError,
    setError: setNotificationsError,
    refresh: refreshNotifications,
    enable: enableNotifications,
    disable: disableNotifications,
    sendTest,
  } = usePushNotifications()

  useEffect(() => {
    void refreshNotifications()
  }, [refreshNotifications])

  const showComingSoon = useCallback((feature: string) => {
    setComingSoonToast(feature)
    setTimeout(() => setComingSoonToast(null), 2500)
  }, [])

  const showNotificationToast = useCallback((message: string) => {
    setNotificationToast(message)
    setTimeout(() => setNotificationToast(null), 2800)
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

  const handleEnableNotifications = async () => {
    setNotificationsError(null)
    const success = await enableNotifications()
    if (success) {
      showNotificationToast('Notifications enabled')
    }
  }

  const handleDisableNotifications = async () => {
    setNotificationsError(null)
    const success = await disableNotifications()
    if (success) {
      showNotificationToast('Notifications disabled')
    }
  }

  const handleSendTest = async () => {
    setNotificationsError(null)
    const success = await sendTest()
    if (success) {
      showNotificationToast('Test notification sent')
    }
  }

  const fetchCapabilitySnapshot = useCallback(async (audience: CapabilityAudience) => {
    setCapabilityLoading(true)
    setCapabilityError(null)

    try {
      const response = await fetch(`/api/system/capabilities?audience=${audience}`)
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error || 'Failed to fetch capability snapshot')
      }

      const payload = await response.json() as { block?: string }
      setCapabilitySnapshot(payload.block || null)
    } catch (error) {
      setCapabilityError(error instanceof Error ? error.message : 'Failed to fetch capability snapshot')
    } finally {
      setCapabilityLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    if (capabilitySnapshot) return
    void fetchCapabilitySnapshot(capabilityAudience)
  }, [capabilityAudience, capabilitySnapshot, fetchCapabilitySnapshot, user])

  const notificationState = useMemo(() => {
    if (!supported) {
      return {
        label: 'Unsupported',
        detail: 'This browser does not support push notifications.',
        tone: 'text-slate-500',
      }
    }

    if (!HAS_VAPID_PUBLIC_KEY) {
      return {
        label: 'Not configured',
        detail: 'Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY in environment.',
        tone: 'text-amber-300',
      }
    }

    if (permission === 'denied') {
      return {
        label: 'Blocked',
        detail: 'Permission is blocked in your browser settings.',
        tone: 'text-amber-300',
      }
    }

    if (permission === 'granted' && subscribed) {
      return {
        label: 'Enabled',
        detail: serverCount > 0
          ? `${serverCount} active subscription${serverCount === 1 ? '' : 's'}`
          : 'Permission granted, syncing subscription...',
        tone: 'text-teal-300',
      }
    }

    return {
      label: 'Off',
      detail: 'Enable to receive proactive Rise check-ins.',
      tone: 'text-slate-400',
    }
  }, [permission, serverCount, subscribed, supported])

  const canEnable = supported && HAS_VAPID_PUBLIC_KEY && permission !== 'granted'
  const canDisable = supported && (subscribed || serverCount > 0)
  const canSendTest = supported && permission === 'granted' && subscribed && serverCount > 0

  return (
    <div className="min-h-screen bg-slate-900 pb-8">
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
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
            Preferences
          </h3>

          <div className="space-y-3">
            <div className="w-full p-3 rounded-xl bg-slate-800/40 border border-slate-700/60">
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-slate-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-slate-200">Notifications</p>
                    {notificationsLoading ? (
                      <span className="text-xs text-slate-500">Checking...</span>
                    ) : (
                      <span className={`text-xs font-medium ${notificationState.tone}`}>
                        {notificationState.label}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{notificationState.detail}</p>
                  {latestUpdatedAt && (
                    <p className="text-xs text-slate-600 mt-1">
                      Last sync: {new Date(latestUpdatedAt).toLocaleString()}
                    </p>
                  )}

                  {permission === 'denied' && (
                    <p className="text-xs text-amber-200/80 mt-2">
                      To re-enable, allow notifications for this site in your browser settings.
                    </p>
                  )}

                  {notificationsError && (
                    <div className="mt-3 flex items-start gap-2 text-sm text-red-300">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{notificationsError}</span>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {canEnable && (
                      <Button
                        size="sm"
                        variant="primary"
                        isLoading={syncing}
                        loadingText="Enabling..."
                        onClick={handleEnableNotifications}
                      >
                        Enable
                      </Button>
                    )}

                    {canDisable && (
                      <Button
                        size="sm"
                        variant="secondary"
                        isLoading={syncing}
                        loadingText="Disabling..."
                        onClick={handleDisableNotifications}
                      >
                        Disable
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      isLoading={testing}
                      loadingText="Sending..."
                      onClick={handleSendTest}
                      disabled={!canSendTest}
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      Send test
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      isLoading={notificationsLoading}
                      loadingText="Refreshing..."
                      onClick={() => {
                        setNotificationsError(null)
                        void refreshNotifications()
                      }}
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Refresh
                    </Button>
                  </div>
                </div>
              </div>
            </div>

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

        <Card>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
            AI System
          </h3>
          <p className="text-slate-400 text-sm mb-4">
            Inspect the live capability map Rise uses, so you can verify what the model currently knows about this app.
          </p>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              value={capabilityAudience}
              onChange={(event) => {
                const next = event.target.value as CapabilityAudience
                setCapabilityAudience(next)
                void fetchCapabilitySnapshot(next)
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
            >
              <option value="general">General</option>
              <option value="path_finder">Path Finder</option>
              <option value="project_chat">Project Chat</option>
              <option value="milestone_mode">Milestone Mode</option>
              <option value="council">Council Room</option>
            </select>

            <Button
              size="sm"
              variant="ghost"
              isLoading={capabilityLoading}
              loadingText="Refreshing..."
              onClick={() => {
                void fetchCapabilitySnapshot(capabilityAudience)
              }}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh snapshot
            </Button>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowCapabilitySnapshot(prev => !prev)}
              disabled={!capabilitySnapshot}
            >
              {showCapabilitySnapshot ? 'Hide details' : 'Show details'}
            </Button>
          </div>

          {capabilityError && (
            <div className="mb-3 flex items-start gap-2 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{capabilityError}</span>
            </div>
          )}

          {showCapabilitySnapshot && capabilitySnapshot && (
            <pre className="max-h-72 overflow-auto rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
              {capabilitySnapshot}
            </pre>
          )}
        </Card>

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

        <p className="text-center text-sm text-slate-600">
          Rise v1.0.0 · Made with care
        </p>
      </main>

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

      <AnimatePresence>
        {notificationToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 shadow-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span className="text-sm text-slate-200">
                  {notificationToast}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
