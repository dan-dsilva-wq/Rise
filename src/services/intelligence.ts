import { createClient } from '@/lib/supabase/server'

export {
  assembleIntelligencePromptDataForUser,
  generateGapAnalysisForUser,
  generateGapQuestionForUser,
  type GapAnalysisResult,
  type GapCandidate,
  type GapQuestionResult,
} from './intelligence/gap'

export {
  buildNotificationContextForUser,
  shouldSendQuestion,
  type NotificationContext,
  type NotificationDecision,
} from './intelligence/notifications'

export {
  answerProactiveQuestionForUser,
  listProactiveQuestionsForUser,
  logProactiveQuestionForUser,
  markProactiveQuestionOpenedForUser,
} from './intelligence/proactive-questions'

import {
  generateGapAnalysisForUser,
  generateGapQuestionForUser,
} from './intelligence/gap'

export async function generateGapQuestion() {
  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  return generateGapQuestionForUser(client as never, user.id)
}

export async function generateGapAnalysis() {
  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  return generateGapAnalysisForUser(client as never, user.id)
}
