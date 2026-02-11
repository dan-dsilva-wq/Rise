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

// Words to ignore for keyword overlap
export const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'has',
  'been', 'being', 'their', 'they', 'them', 'about', 'would', 'could',
  'should', 'into', 'more', 'some', 'when', 'what', 'which', 'there',
  'also', 'very', 'just', 'like', 'than', 'then', 'each', 'other',
  'does', 'will', 'want', 'need', 'make', 'know', 'think', 'feel',
])
