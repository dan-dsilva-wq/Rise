export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface MilestoneAction {
  type: 'complete_step' | 'complete_milestone'
  milestoneId?: string
  stepId?: string
  stepText?: string
  stepNumber?: number
}

export interface ProjectContextInput {
  id: string
  name: string
  description: string | null
  status: string
  milestones: {
    id: string
    title: string
    status: string
    sort_order: number
  }[]
}

export interface MilestoneContext {
  id: string
  title: string
  description: string | null
  status: string
  currentStep?: {
    text: string
    stepNumber: number
    totalSteps: number
    completedSteps: number
  }
}
