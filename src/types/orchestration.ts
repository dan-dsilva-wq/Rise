export type OrchestrationProjectStatus = 'discovery' | 'planning' | 'building' | 'launched'

export type OrchestrationMode = 'do_it_for_me' | 'guide_me'

export type OrchestrationInsightType = 'discovery' | 'blocker' | 'learning'

export type OrchestrationDispatchStatus = 'pending' | 'done'

export interface ProjectContext {
  project: {
    id: string
    name: string
    description: string
    status: OrchestrationProjectStatus
  }
  task: {
    milestoneTitle: string
    milestoneDescription: string | null
    currentStep: string
    completedSteps: string[]
    remainingSteps: string[]
    mode: OrchestrationMode
  }
  decisions: { description: string; madeAt: string }[]
  userPreferences: {
    techComfort: string[]
    workingStyle: string
    avoid: string[]
  }
  relevantInsights: { type: OrchestrationInsightType; content: string }[]
  acceptanceCriteria: string[]
  conversationExcerpt?: string
}

export interface OrchestrationDispatchRecord {
  id: string
  projectId: string
  milestoneId: string
  stepIndex: number
  stepText: string
  status: OrchestrationDispatchStatus
  mode: OrchestrationMode
  prompt: string
  acceptanceCriteria: string[]
  sentAt: string
  updatedAt?: string
}
