'use client'

import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { FeedbackChat } from './FeedbackChat'

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-20 right-5 z-30 w-12 h-12 bg-teal-600 hover:bg-teal-500 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
            aria-label="Send feedback"
          >
            <MessageSquare className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      <FeedbackChat isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
