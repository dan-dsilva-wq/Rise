'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Loader2 } from 'lucide-react'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'

const DISMISSED_KEY = 'rise:notification-banner-dismissed'
const HAS_VAPID_KEY = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)

export function NotificationBanner() {
  const { supported, permission, syncing, error, setError, enable } = usePushNotifications()
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem(DISMISSED_KEY) === '1'
  })

  const visible = supported && HAS_VAPID_KEY && permission === 'default' && !dismissed

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  async function handleEnable() {
    setError(null)
    await enable()
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-8 overflow-hidden"
        >
          <div className="rounded-2xl border border-slate-800 bg-slate-800/50 px-5 py-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-teal-500/10 flex items-center justify-center">
                <Bell className="w-4 h-4 text-teal-300" />
              </div>
              <p className="flex-1 text-sm text-slate-300">
                Get gentle nudges to stay on track.
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  disabled={syncing}
                  onClick={handleEnable}
                  className="text-sm font-medium text-teal-300 hover:text-teal-200 transition-colors px-3 py-1.5 rounded-lg hover:bg-teal-500/10 disabled:opacity-50"
                >
                  {syncing ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Enabling...
                    </span>
                  ) : (
                    'Enable'
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="text-sm text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-700/50"
                >
                  Not now
                </button>
              </div>
            </div>
            {error && (
              <p className="mt-2 text-xs text-red-300 pl-[3.25rem]">{error}</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
