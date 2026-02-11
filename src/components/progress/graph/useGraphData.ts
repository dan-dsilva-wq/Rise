import { useMemo } from 'react'
import { GraphNode, GraphEdge, GraphCategory, RawGraphData } from './types'
import { STOP_WORDS } from './constants'

// Map insight types to graph categories
const INSIGHT_TYPE_MAP: Record<string, GraphCategory> = {
  discovery: 'discoveries',
  decision: 'decisions',
  blocker: 'blockers',
  preference: 'preferences',
  learning: 'skills',
}

// Semantic links: understanding field → category it connects to
const SEMANTIC_LINKS: Array<[string, GraphCategory]> = [
  ['values', 'goals'],
  ['motivations', 'goals'],
  ['strengths', 'skills'],
  ['blockers', 'blockers'],
]

// Some DB fields store JSON objects as strings — extract readable text
function sanitizeLabel(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if (typeof obj.description === 'string') return obj.description
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.summary === 'string') return obj.summary
    if (typeof obj.content === 'string') return obj.content
    if (typeof obj.name === 'string') return obj.name
    return null
  }
  const str = String(raw)
  if (str.startsWith('{') || str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str)
      if (typeof parsed === 'object' && parsed !== null) {
        return sanitizeLabel(parsed)
      }
    } catch {
      // Not JSON — use as-is
    }
  }
  return str
}

function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
  return new Set(words.filter(w => w.length > 5 && !STOP_WORDS.has(w)))
}

export function useGraphData(
  rawData: RawGraphData
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return useMemo(() => {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []

    // 1. Profile facts → nodes
    for (const fact of rawData.facts) {
      const label = sanitizeLabel(fact.fact)
      if (!label) continue
      nodes.push({
        id: `fact-${fact.id}`,
        label,
        category: fact.category as GraphCategory,
        importance: 5,
      })
    }

    // 2. AI insights → nodes
    for (const insight of rawData.insights) {
      const label = sanitizeLabel(insight.content)
      if (!label) continue
      const category = INSIGHT_TYPE_MAP[insight.insight_type] || 'discoveries'
      nodes.push({
        id: `insight-${insight.id}`,
        label,
        category,
        importance: Math.max(1, Math.min(10, insight.importance)),
      })
    }

    // 3. Patterns → nodes (category: discoveries)
    for (const pattern of rawData.patterns) {
      const label = sanitizeLabel(pattern.description)
      if (!label) continue
      nodes.push({
        id: `pattern-${pattern.id}`,
        label,
        category: 'discoveries',
        importance: Math.max(1, Math.min(10, Math.round(pattern.confidence * 10))),
      })
    }

    // 4. Brain dumps (with summary) → nodes (category: situation)
    for (const dump of rawData.brainDumps) {
      const label = sanitizeLabel(dump.summary)
      if (!label) continue
      nodes.push({
        id: `dump-${dump.id}`,
        label,
        category: 'situation',
        importance: 4,
      })
    }

    // 5. User understanding arrays → nodes
    if (rawData.understanding) {
      const u = rawData.understanding

      const arrays: Array<[string[], GraphCategory, number]> = [
        [u.values || [], 'goals', 7],
        [u.motivations || [], 'goals', 7],
        [u.strengths || [], 'skills', 8],
        [u.blockers || [], 'blockers', 7],
      ]

      for (const [items, category, importance] of arrays) {
        for (let i = 0; i < items.length; i++) {
          const label = sanitizeLabel(items[i])
          if (!label) continue
          nodes.push({
            id: `understanding-${category}-${i}`,
            label,
            category,
            importance,
          })
        }
      }

      const successLabel = sanitizeLabel(u.definition_of_success)
      if (successLabel) {
        nodes.push({
          id: 'understanding-success',
          label: successLabel,
          category: 'goals',
          importance: 9,
        })
      }
    }

    // --- EDGE GENERATION ---

    // Group nodes by category
    const byCategory = new Map<GraphCategory, GraphNode[]>()
    for (const node of nodes) {
      const group = byCategory.get(node.category) || []
      group.push(node)
      byCategory.set(node.category, group)
    }

    // 1. Same-category chains
    for (const [, group] of byCategory) {
      for (let i = 0; i < group.length - 1; i++) {
        edges.push({
          source: group[i].id,
          target: group[i + 1].id,
          strength: 0.5,
        })
      }
    }

    // 2. Cross-category keyword overlap (capped at 2 per node)
    const crossLinkCount = new Map<string, number>()
    const keywordCache = new Map<string, Set<string>>()

    for (const node of nodes) {
      keywordCache.set(node.id, extractKeywords(node.label))
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].category === nodes[j].category) continue

        const countA = crossLinkCount.get(nodes[i].id) || 0
        const countB = crossLinkCount.get(nodes[j].id) || 0
        if (countA >= 2 || countB >= 2) continue

        const kw1 = keywordCache.get(nodes[i].id)!
        const kw2 = keywordCache.get(nodes[j].id)!
        let overlap = 0
        for (const w of kw1) {
          if (kw2.has(w)) overlap++
        }

        if (overlap >= 1) {
          edges.push({
            source: nodes[i].id,
            target: nodes[j].id,
            strength: 0.3,
          })
          crossLinkCount.set(nodes[i].id, countA + 1)
          crossLinkCount.set(nodes[j].id, countB + 1)
        }
      }
    }

    // 3. Semantic links: understanding nodes → related category nodes
    if (rawData.understanding) {
      for (const [field, targetCategory] of SEMANTIC_LINKS) {
        const understandingNodes = nodes.filter(n =>
          n.id.startsWith(`understanding-${field === 'values' || field === 'motivations' ? 'goals' : field}`)
        )
        const targetNodes = nodes.filter(n =>
          n.category === targetCategory && !n.id.startsWith('understanding-')
        )
        if (understandingNodes.length > 0 && targetNodes.length > 0) {
          edges.push({
            source: understandingNodes[0].id,
            target: targetNodes[0].id,
            strength: 0.6,
          })
        }
      }
    }

    return { nodes, edges }
  }, [rawData])
}
