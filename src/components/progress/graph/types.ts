export type GraphCategory =
  | 'background'
  | 'skills'
  | 'situation'
  | 'goals'
  | 'preferences'
  | 'constraints'
  | 'discoveries'
  | 'decisions'
  | 'blockers'

export interface GraphNode {
  id: string
  label: string
  category: GraphCategory
  importance: number // 1-10
}

export interface GraphEdge {
  source: string // node id
  target: string // node id
  strength: number // 0-1
}

export interface RawGraphData {
  facts: Array<{
    id: string
    category: 'background' | 'skills' | 'situation' | 'goals' | 'preferences' | 'constraints'
    fact: string
  }>
  insights: Array<{
    id: string
    insight_type: 'discovery' | 'decision' | 'blocker' | 'preference' | 'learning'
    content: string
    importance: number
  }>
  patterns: Array<{
    id: string
    description: string
    confidence: number
  }>
  brainDumps: Array<{
    id: string
    summary: string | null
  }>
  understanding: {
    values: string[]
    motivations: string[]
    strengths: string[]
    blockers: string[]
    definition_of_success: string | null
  } | null
}
