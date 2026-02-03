'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wifi, WifiOff, AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface DebugLog {
  timestamp: string
  type: 'info' | 'error' | 'warn' | 'success'
  message: string
  details?: string
}

// Global debug log store
const debugLogs: DebugLog[] = []
const MAX_LOGS = 50

export function addDebugLog(type: DebugLog['type'], message: string, details?: string) {
  const log: DebugLog = {
    timestamp: new Date().toLocaleTimeString(),
    type,
    message,
    details: details ? String(details).slice(0, 500) : undefined, // Limit details length
  }
  debugLogs.unshift(log)
  if (debugLogs.length > MAX_LOGS) {
    debugLogs.pop()
  }
  // Dispatch custom event so components can update
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('debug-log', { detail: log }))
  }
}

export function ConnectionStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [logs, setLogs] = useState<DebugLog[]>([])
  const [lastCheck, setLastCheck] = useState<string>('')

  // Listen for debug logs
  useEffect(() => {
    const handleDebugLog = () => {
      setLogs([...debugLogs])
    }
    window.addEventListener('debug-log', handleDebugLog)
    return () => window.removeEventListener('debug-log', handleDebugLog)
  }, [])

  const checkConnection = async () => {
    setIsChecking(true)
    const startTime = Date.now()

    try {
      const supabase = createClient()

      // Try to get session - this tests auth connection
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        throw new Error(`Auth error: ${sessionError.message}`)
      }

      if (!session) {
        // Not logged in is not a connection error
        addDebugLog('info', 'No session (not logged in)')
        setIsConnected(true)
        setError(null)
        setLastCheck(new Date().toLocaleTimeString())
        return
      }

      // Test database connection with a simple query
      const { error: dbError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .single()

      const elapsed = Date.now() - startTime

      if (dbError && dbError.code !== 'PGRST116') { // PGRST116 = no rows found, that's ok
        throw new Error(`DB error: ${dbError.message} (code: ${dbError.code})`)
      }

      setIsConnected(true)
      setError(null)
      addDebugLog('success', `Connection OK (${elapsed}ms)`)
      setLastCheck(new Date().toLocaleTimeString())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setIsConnected(false)
      setError(message)
      addDebugLog('error', 'Connection failed', message)
      setLastCheck(new Date().toLocaleTimeString())
    } finally {
      setIsChecking(false)
    }
  }

  // Check connection on mount and every 30 seconds
  useEffect(() => {
    checkConnection()
    const interval = setInterval(checkConnection, 30000)
    return () => clearInterval(interval)
  }, [])

  // Don't show anything while first check is in progress
  if (isConnected === null && isChecking) {
    return null
  }

  return (
    <>
      {/* Connection indicator - always visible in corner */}
      <div className="fixed top-16 right-2 z-50">
        <button
          onClick={() => setShowDebug(!showDebug)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${
            isConnected === false
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : isConnected === true
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
          }`}
        >
          {isConnected === false ? (
            <WifiOff className="w-3 h-3" />
          ) : isConnected === true ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <AlertTriangle className="w-3 h-3" />
          )}
          {isChecking ? '...' : isConnected ? 'OK' : 'ERR'}
          {showDebug ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Full error banner when disconnected */}
      <AnimatePresence>
        {isConnected === false && !showDebug && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-2 right-2 z-50 bg-red-500/20 border border-red-500/30 rounded-xl p-4"
          >
            <div className="flex items-start gap-3">
              <WifiOff className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-red-400">No Cloud Connection</h3>
                <p className="text-sm text-red-300/80 mt-1">
                  Cannot connect to cloud service. Your data won't be saved.
                </p>
                {error && (
                  <p className="text-xs text-red-400/60 mt-2 font-mono break-all">
                    {error}
                  </p>
                )}
                <button
                  onClick={checkConnection}
                  className="mt-3 px-3 py-1.5 bg-red-500/30 hover:bg-red-500/40 rounded-lg text-sm text-red-300 transition-colors"
                >
                  {isChecking ? 'Checking...' : 'Retry Connection'}
                </button>
              </div>
              <button
                onClick={() => setShowDebug(true)}
                className="text-red-400/60 hover:text-red-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Debug Panel */}
      <AnimatePresence>
        {showDebug && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-24 left-2 right-2 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-[60vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/90">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-200">Debug Panel</h3>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={checkConnection}
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300"
                >
                  {isChecking ? '...' : 'Recheck'}
                </button>
                <button
                  onClick={() => setShowDebug(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Status */}
            <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-700 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Last check:</span>
                <span className="text-slate-300">{lastCheck || 'Never'}</span>
              </div>
              {error && (
                <div className="flex justify-between">
                  <span className="text-red-500">Error:</span>
                  <span className="text-red-400 text-right max-w-[70%] break-all">{error}</span>
                </div>
              )}
            </div>

            {/* Logs */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {logs.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-4">No logs yet</p>
              ) : (
                logs.map((log, i) => (
                  <div
                    key={i}
                    className={`text-xs p-2 rounded font-mono ${
                      log.type === 'error' ? 'bg-red-500/10 text-red-400' :
                      log.type === 'warn' ? 'bg-yellow-500/10 text-yellow-400' :
                      log.type === 'success' ? 'bg-green-500/10 text-green-400' :
                      'bg-slate-700/50 text-slate-400'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-slate-500 flex-shrink-0">{log.timestamp}</span>
                      <span className="flex-1 break-all">{log.message}</span>
                    </div>
                    {log.details && (
                      <div className="mt-1 text-[10px] opacity-70 break-all pl-12">
                        {log.details}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Clear button */}
            <div className="px-4 py-2 border-t border-slate-700 bg-slate-800/90">
              <button
                onClick={() => {
                  debugLogs.length = 0
                  setLogs([])
                }}
                className="w-full py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300"
              >
                Clear Logs
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
