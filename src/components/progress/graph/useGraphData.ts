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

function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
  return new Set(words.filter(w => w.length > 5 && !STOP_WORDS.has(w)))
}

function randomSpread(center: number, range: number): number {
  return center + (Math.random() - 0.5) * range
}

export function useGraphData(
  rawData: RawGraphData,
  width: number,
  height: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return useMemo(() => {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const cx = width / 2
    const cy = height / 2
    const spread = Math.min(width, height) * 0.35

    // 1. Profile facts → nodes
    for (const fact of rawData.facts) {
      nodes.push({
        id: `fact-${fact.id}`,
        label: fact.fact,
        category: fact.category as GraphCategory,
        importance: 5,
        x: randomSpread(cx, spread),
        y: randomSpread(cy, spread),
        vx: 0,
        vy: 0,
      })
    }

    // 2. AI insights → nodes
    for (const insight of rawData.insights) {
      const category = INSIGHT_TYPE_MAP[insight.insight_type] || 'discoveries'
      nodes.push({
        id: `insight-${insight.id}`,
        label: insight.content,
        category,
        importance: Math.max(1, Math.min(10, insight.importance)),
        x: randomSpread(cx, spread),
        y: randomSpread(cy, spread),
        vx: 0,
        vy: 0,
      })
    }

    // 3. Patterns → nodes (category: discoveries)
    for (const pattern of rawData.patterns) {
      nodes.push({
        id: `pattern-${pattern.id}`,
        label: pattern.description,
        category: 'discoveries',
        importance: Math.max(1, Math.min(10, Math.round(pattern.confidence * 10))),
        x: randomSpread(cx, spread),
        y: randomSpread(cy, spread),
        vx: 0,
        vy: 0,
      })
    }

    // 4. Brain dumps (with summary) → nodes (category: situation)
    for (const dump of rawData.brainDumps) {
      if (!dump.summary) continue
      nodes.push({
        id: `dump-${dump.id}`,
        label: dump.summary,
        category: 'situation',
        importance: 4,
        x: randomSpread(cx, spread),
        y: randomSpread(cy, spread),
        vx: 0,
        vy: 0,
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
          nodes.push({
            id: `understanding-${category}-${i}`,
            label: items[i],
            category,
            importance,
            x: randomSpread(cx, spread),
            y: randomSpread(cy, spread),
            vx: 0,
            vy: 0,
          })
        }
      }

      if (u.definition_of_success) {
        nodes.push({
          id: 'understanding-success',
          label: u.definition_of_success,
          category: 'goals',
          importance: 9,
          x: randomSpread(cx, spread),
          y: randomSpread(cy, spread),
          vx: 0,
          vy: 0,
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
        // Link first understanding node to first target node if both exist
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
  }, [rawData, width, height])
}
