import type { ProjectContextType, InsightType } from '@/lib/supabase/types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface SuggestedFact {
  category: 'background' | 'skills' | 'situation' | 'goals' | 'preferences' | 'constraints'
  fact: string
}

export interface ExtractedContext {
  projectId: string
  type: ProjectContextType
  key: string
  value: string
  confidence?: number
}

export interface ExtractedInsight {
  type: InsightType
  content: string
  importance?: number
  projectId?: string
}

export interface MilestoneWithSteps {
  title: string
  steps: string[]
}

export interface ProjectAction {
  type: 'create' | 'add_milestone' | 'add_idea' | 'add_note' | 'promote_idea' | 'set_focus' | 'update_status' | 'edit_milestone' | 'complete_milestone' | 'discard_milestone' | 'reorder_milestones' | 'update_steps'
  projectId?: string
  milestoneId?: string
  name?: string
  description?: string
  milestones?: string[]
  milestonesWithSteps?: MilestoneWithSteps[]
  newMilestone?: string
  newMilestoneSteps?: string[]
  newIdea?: string
  newNote?: string
  newTitle?: string
  newDescription?: string
  newStatus?: 'discovery' | 'planning' | 'building' | 'launched' | 'paused'
  focusLevel?: 'active' | 'next' | 'backlog'
  milestoneOrder?: string[]
  newSteps?: string[]
}

export interface ExistingProject {
  id: string
  name: string
  description: string | null
  status: string
  milestones: {
    id: string
    title: string
    status: string
    sort_order: number
    notes: string | null
    focus_level: string
    completed_at: string | null
    completedSteps: number
    totalSteps: number
  }[]
  ideas: {
    id: string
    title: string
    notes: string | null
  }[]
}
