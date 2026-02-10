import type {
  PathFinderConversation,
  PathFinderMessage,
  ProfileCategory,
  UserProfileFact,
} from '@/lib/supabase/types'

export interface ActionResult {
  type: 'create_project' | 'add_milestone' | 'add_idea' | 'add_note' | 'promote_idea' | 'set_focus' | 'update_status' | 'edit_milestone' | 'complete_milestone' | 'discard_milestone' | 'reorder' | 'update_steps'
  text: string
  projectId?: string
  projectName?: string
  milestoneId?: string
  milestoneTitle?: string
  isIdea?: boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  actionResults?: ActionResult[]
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

export type ProjectListItem = Pick<ExistingProject, 'id' | 'name' | 'description' | 'status'>
export type MilestoneItem = {
  id: string
  title: string
  status: string
  sort_order: number
  notes: string | null
  focus_level: string
  completed_at: string | null
}

export interface PathFinderChatProps {
  userId: string
  initialConversation?: PathFinderConversation | null
  initialConversations?: PathFinderConversation[]
  initialMessages?: PathFinderMessage[]
  initialFacts?: UserProfileFact[]
  onboardingMode?: boolean
  onProjectCreated?: (projectId: string, projectName: string) => void
}

export type PathFinderCategory = ProfileCategory
