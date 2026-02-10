import { saveAiInsight } from '@/lib/hooks/aiContextServer'

type AiContextClient = Parameters<typeof saveAiInsight>[0]

export function persistMilestoneModeInsights(params: {
  supabaseClient: AiContextClient
  userId: string
  projectId: string
  milestoneId: string
  insights: Array<{ type: 'discovery' | 'decision' | 'blocker' | 'preference' | 'learning'; content: string; importance: number }>
}): Promise<void> {
  if (params.insights.length === 0) return Promise.resolve()

  return Promise.all(
    params.insights.map(insight =>
      saveAiInsight(
        params.supabaseClient,
        params.userId,
        insight.type,
        insight.content,
        'milestone_mode',
        {
          projectId: params.projectId,
          milestoneId: params.milestoneId,
          importance: insight.importance,
        }
      )
    )
  ).then(() => undefined)
}
