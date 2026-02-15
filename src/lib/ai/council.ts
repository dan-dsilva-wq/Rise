import Anthropic from '@anthropic-ai/sdk'
import type { InsightType } from '@/lib/supabase/types'

export interface CouncilInsight {
  type: InsightType
  content: string
  importance: number
}

export interface CouncilPayload {
  analyst: string
  critic: string
  strategist: string
  operator: string
  synthesis: string
  final_answer: string
  insights: CouncilInsight[]
}

const VALID_INSIGHT_TYPES: InsightType[] = ['discovery', 'decision', 'blocker', 'preference', 'learning']

export function extractTextFromClaude(response: { content: Array<{ type: string }> }): string {
  return response.content
    .filter(block => block.type === 'text')
    .map(block => (block as Anthropic.TextBlock).text)
    .join('\n')
}

export function normalizeCouncilInsights(raw: unknown): CouncilInsight[] {
  if (!Array.isArray(raw)) return []

  const insights: CouncilInsight[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as { type?: unknown; content?: unknown; importance?: unknown }
    const type = typeof candidate.type === 'string'
      ? candidate.type.toLowerCase() as InsightType
      : null
    const content = typeof candidate.content === 'string' ? candidate.content.trim() : ''
    const rawImportance = typeof candidate.importance === 'number'
      ? candidate.importance
      : Number.parseInt(String(candidate.importance ?? ''), 10)
    const importance = Number.isFinite(rawImportance)
      ? Math.max(1, Math.min(10, Math.round(rawImportance)))
      : 5

    if (!type || !VALID_INSIGHT_TYPES.includes(type)) continue
    if (!content) continue
    insights.push({ type, content, importance })
  }

  return insights
}

export function parseCouncilPayload(raw: string): CouncilPayload | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const candidates: string[] = []
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (jsonMatch?.[0]) candidates.push(jsonMatch[0].trim())
  if (candidates.length === 0) candidates.push(trimmed)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<CouncilPayload>
      if (
        typeof parsed.analyst === 'string' &&
        typeof parsed.critic === 'string' &&
        typeof parsed.strategist === 'string' &&
        typeof parsed.operator === 'string' &&
        typeof parsed.synthesis === 'string' &&
        typeof parsed.final_answer === 'string'
      ) {
        return {
          analyst: parsed.analyst.trim(),
          critic: parsed.critic.trim(),
          strategist: parsed.strategist.trim(),
          operator: parsed.operator.trim(),
          synthesis: parsed.synthesis.trim(),
          final_answer: parsed.final_answer.trim(),
          insights: normalizeCouncilInsights((parsed as { insights?: unknown }).insights),
        }
      }
    } catch {
      // Continue to next candidate
    }
  }

  return null
}

export function getCouncilStructuredOutputInstructions(): string {
  return `When you learn something durable about the user, add it to "insights" as 0-3 objects:
{ "type": "discovery|decision|blocker|preference|learning", "content": "...", "importance": 1-10 }
Do not include [INSIGHT] tags in any field.

Respond ONLY with valid JSON:
{
  "analyst": "...",
  "critic": "...",
  "strategist": "...",
  "operator": "...",
  "synthesis": "...",
  "final_answer": "...",
  "insights": []
}`
}
