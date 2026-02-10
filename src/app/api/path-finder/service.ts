import { saveProjectContext, saveAiInsight } from '@/lib/hooks/aiContextServer'
import type { ExtractedContext, ExtractedInsight } from './types'

type AiContextClient = Parameters<typeof saveProjectContext>[0]

export function persistPathFinderContexts(
  supabaseClient: AiContextClient,
  userId: string,
  contexts: ExtractedContext[]
): Promise<void> {
  if (contexts.length === 0) return Promise.resolve()

  return Promise.all(
    contexts.map(ctx =>
      saveProjectContext(
        supabaseClient,
        userId,
        ctx.projectId,
        ctx.type,
        ctx.key,
        ctx.value,
        ctx.confidence,
        'path_finder'
      )
    )
  ).then(() => undefined)
}

export function persistPathFinderInsights(
  supabaseClient: AiContextClient,
  userId: string,
  insights: ExtractedInsight[]
): Promise<void> {
  if (insights.length === 0) return Promise.resolve()

  return Promise.all(
    insights.map(insight =>
      saveAiInsight(
        supabaseClient,
        userId,
        insight.type,
        insight.content,
        'path_finder',
        {
          projectId: insight.projectId,
          importance: insight.importance,
        }
      )
    )
  ).then(() => undefined)
}
