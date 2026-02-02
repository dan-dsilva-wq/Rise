// ================================
// XP VALUES - The Core Economy
// ================================

export const XP_VALUES = {
  // Morning activation (core loop)
  IM_UP: 50,
  IM_UP_EARLY_BONUS: 25, // Before 7 AM
  IM_UP_ON_TIME_BONUS: 15, // Within target wake time

  // Morning checklist
  FEET_ON_FLOOR: 10,
  LIGHT_EXPOSURE: 15,
  DRANK_WATER: 10,
  MORNING_CHECKIN: 20, // Completing mood/energy

  // Streaks
  STREAK_BONUS_PER_DAY: 5, // Multiplied by streak length (capped)
  STREAK_CAP: 30, // Max streak bonus = 150 XP

  // Movement (Tier 2)
  MOVEMENT_PER_MINUTE: 2, // Up to 30 minutes = 60 XP
  MOVEMENT_CAP_MINUTES: 30,
  WENT_OUTSIDE: 25,

  // Evening reflection (Tier 3)
  EVENING_CHECKIN: 25,
  GRATITUDE_ENTRY: 30,
  DAY_RATING: 10,

  // Custom habits (Tier 4)
  HABIT_DEFAULT: 25,
  HABIT_STREAK_BONUS: 5, // Per day of habit streak

  // Achievement unlocks (variable per achievement)
  ACHIEVEMENT_BASE: 100,
} as const

// ================================
// LEVEL THRESHOLDS
// ================================

export const LEVEL_THRESHOLDS: number[] = [
  0,      // Level 1
  100,    // Level 2
  250,    // Level 3
  450,    // Level 4
  700,    // Level 5
  1000,   // Level 6
  1400,   // Level 7
  1900,   // Level 8
  2500,   // Level 9
  3200,   // Level 10
  4000,   // Level 11
  5000,   // Level 12
  6200,   // Level 13
  7600,   // Level 14
  9200,   // Level 15
  11000,  // Level 16
  13000,  // Level 17
  15500,  // Level 18
  18500,  // Level 19
  22000,  // Level 20 (max)
]

// ================================
// TIER UNLOCK THRESHOLDS
// ================================

export const TIER_THRESHOLDS = {
  1: { xp: 0, name: 'Wake', features: ['Morning activation', 'Basic tracking'] },
  2: { xp: 500, name: 'Move', features: ['Movement tracking', 'Outdoor bonus'] },
  3: { xp: 1500, name: 'Reflect', features: ['Evening reflection', 'Gratitude journal'] },
  4: { xp: 4000, name: 'Build', features: ['Custom habits', 'Habit stacking'] },
  5: { xp: 10000, name: 'Thrive', features: ['Financial clarity module'] },
} as const

export type TierNumber = keyof typeof TIER_THRESHOLDS

// ================================
// CALCULATION FUNCTIONS
// ================================

/**
 * Calculate level from total XP
 */
export function calculateLevel(totalXp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]) {
      return i + 1
    }
  }
  return 1
}

/**
 * Calculate XP needed for next level
 */
export function xpForNextLevel(currentLevel: number): number {
  if (currentLevel >= LEVEL_THRESHOLDS.length) {
    return 0 // Max level
  }
  return LEVEL_THRESHOLDS[currentLevel] // Next level threshold
}

/**
 * Calculate progress to next level (0-100%)
 */
export function levelProgress(totalXp: number): number {
  const level = calculateLevel(totalXp)
  if (level >= LEVEL_THRESHOLDS.length) {
    return 100 // Max level
  }

  const currentLevelXp = LEVEL_THRESHOLDS[level - 1]
  const nextLevelXp = LEVEL_THRESHOLDS[level]
  const xpInLevel = totalXp - currentLevelXp
  const xpNeeded = nextLevelXp - currentLevelXp

  return Math.round((xpInLevel / xpNeeded) * 100)
}

/**
 * Calculate tier from total XP
 */
export function calculateTier(totalXp: number): TierNumber {
  const tiers = Object.entries(TIER_THRESHOLDS)
    .map(([tier, data]) => ({ tier: Number(tier) as TierNumber, ...data }))
    .sort((a, b) => b.xp - a.xp)

  for (const { tier, xp } of tiers) {
    if (totalXp >= xp) {
      return tier
    }
  }
  return 1
}

/**
 * Calculate morning XP earned
 */
export function calculateMorningXp(options: {
  imUp: boolean
  isEarly?: boolean // Before 7 AM
  isOnTime?: boolean // Within target
  feetOnFloor?: boolean
  lightExposure?: boolean
  drankWater?: boolean
  moodCheckin?: boolean
  streakDays?: number
}): number {
  let xp = 0

  if (options.imUp) {
    xp += XP_VALUES.IM_UP
    if (options.isEarly) xp += XP_VALUES.IM_UP_EARLY_BONUS
    if (options.isOnTime) xp += XP_VALUES.IM_UP_ON_TIME_BONUS
  }

  if (options.feetOnFloor) xp += XP_VALUES.FEET_ON_FLOOR
  if (options.lightExposure) xp += XP_VALUES.LIGHT_EXPOSURE
  if (options.drankWater) xp += XP_VALUES.DRANK_WATER
  if (options.moodCheckin) xp += XP_VALUES.MORNING_CHECKIN

  // Streak bonus (capped)
  if (options.streakDays && options.streakDays > 0) {
    const streakBonus = Math.min(options.streakDays, XP_VALUES.STREAK_CAP) * XP_VALUES.STREAK_BONUS_PER_DAY
    xp += streakBonus
  }

  return xp
}

/**
 * Calculate movement XP
 */
export function calculateMovementXp(minutes: number, wentOutside: boolean): number {
  const cappedMinutes = Math.min(minutes, XP_VALUES.MOVEMENT_CAP_MINUTES)
  let xp = cappedMinutes * XP_VALUES.MOVEMENT_PER_MINUTE

  if (wentOutside) {
    xp += XP_VALUES.WENT_OUTSIDE
  }

  return xp
}

/**
 * Calculate evening reflection XP
 */
export function calculateEveningXp(options: {
  checkin?: boolean
  gratitude?: boolean
  dayRating?: boolean
}): number {
  let xp = 0

  if (options.checkin) xp += XP_VALUES.EVENING_CHECKIN
  if (options.gratitude) xp += XP_VALUES.GRATITUDE_ENTRY
  if (options.dayRating) xp += XP_VALUES.DAY_RATING

  return xp
}

// ================================
// STREAK HELPERS
// ================================

/**
 * Check if streak should be maintained (with grace day logic)
 */
export function shouldMaintainStreak(
  lastLogDate: Date,
  today: Date,
  graceDaysUsed: number
): { maintain: boolean; useGraceDay: boolean } {
  const diffDays = Math.floor(
    (today.getTime() - lastLogDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (diffDays <= 1) {
    // Consecutive day or same day
    return { maintain: true, useGraceDay: false }
  }

  if (diffDays === 2 && graceDaysUsed < 1) {
    // Missed one day, use grace day
    return { maintain: true, useGraceDay: true }
  }

  // Streak broken
  return { maintain: false, useGraceDay: false }
}

/**
 * Format XP with + prefix
 */
export function formatXpGain(xp: number): string {
  return `+${xp} XP`
}

/**
 * Get tier info
 */
export function getTierInfo(tier: TierNumber) {
  return TIER_THRESHOLDS[tier]
}

/**
 * Get next tier info
 */
export function getNextTierInfo(currentTier: TierNumber) {
  const nextTier = (currentTier + 1) as TierNumber
  if (nextTier > 5) return null
  return { tier: nextTier, ...TIER_THRESHOLDS[nextTier] }
}
