'use client'

import { motion } from 'framer-motion'
import { Lock, Check } from 'lucide-react'
import { TIER_THRESHOLDS, TierNumber } from '@/lib/gamification/xp-values'

interface TierProgressProps {
  currentTier: TierNumber
  totalXp: number
  className?: string
}

const tierEmojis: Record<TierNumber, string> = {
  1: '🌅',
  2: '🏃',
  3: '🧘',
  4: '🔨',
  5: '🌟',
}

export function TierProgress({ currentTier, totalXp, className = '' }: TierProgressProps) {
  const tiers = Object.entries(TIER_THRESHOLDS).map(([tier, data]) => ({
    tier: Number(tier) as TierNumber,
    ...data,
  }))

  return (
    <div className={className}>
      <h3 className="text-lg font-semibold text-slate-200 mb-4">Your Journey</h3>

      <div className="space-y-3">
        {tiers.map(({ tier, name, xp, features }) => {
          const isUnlocked = currentTier >= tier
          const isCurrent = currentTier === tier
          const nextTier = tiers.find(t => t.tier === currentTier + 1)
          const progress = isCurrent && nextTier
            ? Math.min(100, ((totalXp - xp) / (nextTier.xp - xp)) * 100)
            : isUnlocked ? 100 : 0

          return (
            <motion.div
              key={tier}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: tier * 0.1 }}
              className={`p-4 rounded-xl border transition-all ${
                isUnlocked
                  ? 'bg-slate-800/50 border-teal-500/30'
                  : 'bg-slate-900/50 border-slate-700/50 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Icon */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isUnlocked
                      ? 'bg-teal-500/20'
                      : 'bg-slate-700/50'
                  }`}
                >
                  {isUnlocked ? (
                    <span className="text-xl">{tierEmojis[tier]}</span>
                  ) : (
                    <Lock className="w-5 h-5 text-slate-500" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${isUnlocked ? 'text-slate-200' : 'text-slate-400'}`}>
                      Tier {tier}: {name}
                    </span>
                    {isUnlocked && !isCurrent && (
                      <Check className="w-4 h-4 text-teal-400" />
                    )}
                  </div>

                  {/* Progress bar for current tier */}
                  {isCurrent && nextTier && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-teal-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 mt-1">
                        {totalXp.toLocaleString()} / {nextTier.xp.toLocaleString()} XP
                      </span>
                    </div>
                  )}

                  {/* XP requirement for locked tiers */}
                  {!isUnlocked && (
                    <span className="text-sm text-slate-500">
                      Unlocks at {xp.toLocaleString()} XP
                    </span>
                  )}

                  {/* Features list */}
                  {isUnlocked && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {features.map((feature) => (
                        <span
                          key={feature}
                          className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
