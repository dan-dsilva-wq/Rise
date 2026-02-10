import type {
  Milestone,
  MilestoneConversation,
  MilestoneMessage,
  MilestoneStep,
  Project,
} from '@/lib/supabase/types'

export type Approach = 'do-it' | 'guide'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
}

export interface MilestoneAction {
  type: 'complete_step' | 'complete_milestone'
  milestoneId?: string
  stepId?: string
  stepText?: string
  stepNumber?: number
}

export interface MilestoneWithProject extends Milestone {
  project: Project
  allMilestones: Milestone[]
  steps: MilestoneStep[]
}

export interface MilestoneModeChatProps {
  userId: string
  milestone: MilestoneWithProject
  initialConversation?: MilestoneConversation | null
  initialMessages?: MilestoneMessage[]
  initialApproach?: Approach
  contextualOpener?: string | null
  contextualQuickPrompts?: string[] | null
}
