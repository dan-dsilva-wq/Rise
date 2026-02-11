import { GraphCategory } from './types'

export const CATEGORY_COLORS: Record<GraphCategory, string> = {
  background: '#5b9fa6',  // muted teal
  skills: '#8b8fbf',      // slate-violet
  situation: '#6a9fd8',   // cool blue
  goals: '#c4a961',       // muted gold
  preferences: '#a07a8f', // dusty mauve
  constraints: '#b08a60', // warm slate
  discoveries: '#5daa8f', // sage green
  decisions: '#7a82b5',   // slate-indigo
  blockers: '#b87272',    // muted coral
}

export const CATEGORY_LABELS: Record<GraphCategory, string> = {
  background: 'Background',
  skills: 'Skills',
  situation: 'Situation',
  goals: 'Goals',
  preferences: 'Preferences',
  constraints: 'Constraints',
  discoveries: 'Discoveries',
  decisions: 'Decisions',
  blockers: 'Blockers',
}

// Node sizing: importance 1-10 → radius 6-22px
export function nodeRadius(importance: number): number {
  const clamped = Math.max(1, Math.min(10, importance))
  return 6 + (clamped - 1) * (16 / 9)
}

// Physics constants
export const PHYSICS = {
  REPULSION: 800,
  SPRING_LENGTH: 80,
  SPRING_STRENGTH: 0.04,
  GRAVITY: 0.02,
  DAMPING: 0.92,
  MIN_VELOCITY: 0.01,
  BREATHING_AMPLITUDE: 1.5,
  BREATHING_SPEED: 0.0008,
}

// Edge opacity range
export const EDGE_OPACITY_MIN = 0.12
export const EDGE_OPACITY_MAX = 0.3
export const EDGE_HIGHLIGHT_OPACITY = 0.6

// Words to ignore for keyword overlap
export const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'has',
  'been', 'being', 'their', 'they', 'them', 'about', 'would', 'could',
  'should', 'into', 'more', 'some', 'when', 'what', 'which', 'there',
  'also', 'very', 'just', 'like', 'than', 'then', 'each', 'other',
  'does', 'will', 'want', 'need', 'make', 'know', 'think', 'feel',
])
