'use client'

import { useState } from 'react'
import { Mic } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { BrainDumpOverlay } from './BrainDumpOverlay'

export function BrainDumpButton() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  const shouldHideButton =
    pathname?.startsWith('/evening') ||
    pathname?.startsWith('/brain-dump') ||
    pathname?.startsWith('/path-finder') ||
    pathname?.startsWith('/progress') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/signup')

  if (shouldHideButton) {
    return null
  }

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-20 left-5 z-30 w-12 h-12 bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
            aria-label="Brain dump"
          >
            <Mic className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      <BrainDumpOverlay isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
