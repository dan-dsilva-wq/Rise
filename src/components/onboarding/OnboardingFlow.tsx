'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Target, Sun, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { StepIndicator } from './StepIndicator'
import { PathFinderChat } from '@/components/path-finder/PathFinderChat'
import type { PathFinderConversation, PathFinderMessage, UserProfileFact } from '@/lib/supabase/types'

interface OnboardingFlowProps {
  userId: string
  initialFacts: UserProfileFact[]
  initialConversations: PathFinderConversation[]
  initialConversation: PathFinderConversation | null
  initialMessages: PathFinderMessage[]
}

const STEPS = [
  { id: 1, label: 'Welcome' },
  { id: 2, label: 'How It Works' },
  { id: 3, label: 'Path Finder' },
  { id: 4, label: 'Done' },
] as const

const EXPLAINER_CARDS = [
  {
    icon: Compass,
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    title: 'Discover',
    description: 'Chat with Path Finder to figure out what to build',
  },
  {
    icon: Target,
    color: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    title: 'Plan',
    description: 'It creates a project with milestones and steps',
  },
  {
    icon: Sun,
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    title: 'Focus',
    description: 'One step at a time on your dashboard. Done or Not now.',
  },
]

const pageTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

export function OnboardingFlow({
  userId,
  initialFacts,
  initialConversations,
  initialConversation,
  initialMessages,
}: OnboardingFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [createdProject, setCreatedProject] = useState<{ id: string; name: string } | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [completing, setCompleting] = useState(false)

  const handleProjectCreated = (projectId: string, projectName: string) => {
    setCreatedProject({ id: projectId, name: projectName })
    setShowCelebration(true)
    setTimeout(() => {
      setShowCelebration(false)
      setStep(4)
    }, 1500)
  }

  const handleComplete = async () => {
    setCompleting(true)
    try {
      await fetch('/api/onboarding/complete', { method: 'POST' })
      router.push('/')
      router.refresh()
    } catch {
      // Still navigate even if the API call fails
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col relative overflow-hidden">
      {/* Teal gradient accent at top */}
      <div className="h-1 bg-gradient-to-r from-teal-500 via-purple-500 to-teal-500" />

      <AnimatePresence mode="wait">
        {/* Step 1: Welcome */}
        {step === 1 && (
          <motion.div
            key="welcome"
            {...pageTransition}
            className="flex-1 flex flex-col items-center justify-center px-6 text-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/20 to-purple-500/20 border border-teal-500/30 flex items-center justify-center mb-8"
            >
              <Sparkles className="w-8 h-8 text-teal-400" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-3xl font-bold text-white mb-3"
            >
              Welcome to Rise
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-slate-400 text-lg mb-12 max-w-xs"
            >
              Your personal companion for building something that matters.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="w-full max-w-xs space-y-6"
            >
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => setStep(2)}
              >
                Let&apos;s go
              </Button>
              <StepIndicator current={1} total={4} />
            </motion.div>
          </motion.div>
        )}

        {/* Step 2: How It Works */}
        {step === 2 && (
          <motion.div
            key="explainer"
            {...pageTransition}
            className="flex-1 flex flex-col items-center justify-center px-6"
          >
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-bold text-white mb-2 text-center"
            >
              How Rise works
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-slate-400 mb-8 text-center"
            >
              Three simple steps to get moving
            </motion.p>

            <div className="w-full max-w-sm space-y-0 relative">
              {/* Connecting vertical line */}
              <div className="absolute left-6 top-10 bottom-10 w-px bg-slate-700" />

              {EXPLAINER_CARDS.map((card, index) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + index * 0.15 }}
                  className="flex items-start gap-4 py-4 relative"
                >
                  <div className={`flex-shrink-0 w-12 h-12 rounded-xl border flex items-center justify-center z-10 ${card.color}`}>
                    <card.icon className="w-6 h-6" />
                  </div>
                  <div className="pt-1">
                    <h3 className="text-white font-semibold mb-0.5">{card.title}</h3>
                    <p className="text-slate-400 text-sm">{card.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="w-full max-w-xs mt-8 space-y-6"
            >
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => setStep(3)}
              >
                Got it
              </Button>
              <StepIndicator current={2} total={4} />
            </motion.div>
          </motion.div>
        )}

        {/* Step 3: Path Finder Chat */}
        {step === 3 && (
          <motion.div
            key="pathfinder"
            {...pageTransition}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Skip link */}
            <div className="flex items-center justify-end px-4 py-3">
              <button
                onClick={() => setStep(4)}
                className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Skip for now
              </button>
            </div>

            {/* Embedded PathFinderChat */}
            <div className="flex-1 min-h-0 max-w-lg mx-auto w-full">
              <PathFinderChat
                userId={userId}
                initialConversation={initialConversation}
                initialConversations={initialConversations}
                initialMessages={initialMessages}
                initialFacts={initialFacts}
                onboardingMode
                onProjectCreated={handleProjectCreated}
              />
            </div>
          </motion.div>
        )}

        {/* Step 4: Completion */}
        {step === 4 && (
          <motion.div
            key="complete"
            {...pageTransition}
            className="flex-1 flex flex-col items-center justify-center px-6 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500/30 to-green-500/30 border border-teal-500/40 flex items-center justify-center mb-8"
            >
              <svg className="w-8 h-8 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>

            {createdProject ? (
              <>
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-2xl font-bold text-white mb-3"
                >
                  Your first project is ready!
                </motion.h2>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-slate-800/70 rounded-2xl px-5 py-3 border border-teal-500/20 mb-4"
                >
                  <p className="text-teal-400 font-medium">{createdProject.name}</p>
                </motion.div>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-slate-400 mb-12 max-w-xs"
                >
                  Head to your dashboard to start working through your first milestone.
                </motion.p>
              </>
            ) : (
              <>
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-2xl font-bold text-white mb-3"
                >
                  You&apos;re all set!
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-slate-400 mb-12 max-w-xs"
                >
                  You can chat with Path Finder anytime from the Discover tab to create your first project.
                </motion.p>
              </>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="w-full max-w-xs space-y-6"
            >
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={handleComplete}
                isLoading={completing}
                loadingText="Setting up..."
              >
                Start using Rise
              </Button>
              <StepIndicator current={4} total={4} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Celebration overlay */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-teal-500/30 to-purple-500/30 border border-teal-500/40 flex items-center justify-center mx-auto mb-4"
              >
                <Sparkles className="w-10 h-10 text-teal-400" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-xl font-bold text-white"
              >
                Project created!
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
