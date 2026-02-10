import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ProactiveQuestion } from '@/lib/supabase/types'

type DbClient = SupabaseClient<Database>

function toClient(client: DbClient) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any
}

interface CreateProactiveQuestionInput {
  gapIdentified: string
  question: string
  sentAt?: string
}

export async function logProactiveQuestionForUser(
  client: DbClient,
  userId: string,
  input: CreateProactiveQuestionInput
): Promise<ProactiveQuestion> {
  const supabase = toClient(client)

  const { data, error } = await supabase
    .from('proactive_questions')
    .insert({
      user_id: userId,
      gap_identified: input.gapIdentified,
      question: input.question,
      sent_at: input.sentAt || new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to log proactive question')
  }

  return data as ProactiveQuestion
}

export async function markProactiveQuestionOpenedForUser(
  client: DbClient,
  userId: string,
  questionId: string
): Promise<ProactiveQuestion | null> {
  const supabase = toClient(client)

  const { data, error } = await supabase
    .from('proactive_questions')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', questionId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as ProactiveQuestion | null) || null
}

interface AnswerProactiveQuestionInput {
  questionId: string
  answer: string
  qualityScore?: number
}

export async function answerProactiveQuestionForUser(
  client: DbClient,
  userId: string,
  input: AnswerProactiveQuestionInput
): Promise<ProactiveQuestion | null> {
  const supabase = toClient(client)
  const qualityScore = input.qualityScore && input.qualityScore >= 1 && input.qualityScore <= 10
    ? Math.floor(input.qualityScore)
    : null

  const { data, error } = await supabase
    .from('proactive_questions')
    .update({
      answer: input.answer,
      answered_at: new Date().toISOString(),
      quality_score: qualityScore,
    })
    .eq('id', input.questionId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as ProactiveQuestion | null) || null
}

export async function listProactiveQuestionsForUser(
  client: DbClient,
  userId: string,
  limit = 30
): Promise<ProactiveQuestion[]> {
  const supabase = toClient(client)

  const { data, error } = await supabase
    .from('proactive_questions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return (data as ProactiveQuestion[]) || []
}

