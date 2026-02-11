'use client'

import { useRef, useCallback } from 'react'
import { GraphNode, GraphEdge } from './types'
import {
  CATEGORY_COLORS,
  nodeRadius,
  EDGE_OPACITY_MIN,
  EDGE_OPACITY_MAX,
  EDGE_HIGHLIGHT_OPACITY,
} from './constants'
import { useForceSimulation } from './useForceSimulation'

interface SVGGraphProps {
  initialNodes: GraphNode[]
  edges: GraphEdge[]
  width: number
  height: number
  selectedNodeId: string | null
  connectedNodeIds: Set<string>
  onNodeTap: (node: GraphNode) => void
}

export function SVGGraph({
  initialNodes,
  edges,
  width,
  height,
  selectedNodeId,
  connectedNodeIds,
  onNodeTap,
}: SVGGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const edgeRefs = useRef<Map<string, SVGLineElement>>(new Map())
  const nodeRefs = useRef<Map<string, SVGCircleElement>>(new Map())

  const onTick = useCallback(() => {
    const state = simRef.current
    if (!state) return

    const { nodes } = state
    const nodeMap = new Map<string, GraphNode>()
    for (const n of nodes) {
      nodeMap.set(n.id, n)
      const circle = nodeRefs.current.get(n.id)
      if (circle) {
        circle.setAttribute('cx', String(n.x))
        circle.setAttribute('cy', String(n.y))
      }
    }

    for (const edge of edges) {
      const line = edgeRefs.current.get(`${edge.source}-${edge.target}`)
      const s = nodeMap.get(edge.source)
      const t = nodeMap.get(edge.target)
      if (line && s && t) {
        line.setAttribute('x1', String(s.x))
        line.setAttribute('y1', String(s.y))
        line.setAttribute('x2', String(t.x))
        line.setAttribute('y2', String(t.y))
      }
    }
  }, [edges])

  const simRef = useForceSimulation(initialNodes, edges, width, height, onTick)

  const edgeOpacity = (edge: GraphEdge) => {
    if (!selectedNodeId) {
      return EDGE_OPACITY_MIN + (edge.strength * (EDGE_OPACITY_MAX - EDGE_OPACITY_MIN))
    }
    if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
      return EDGE_HIGHLIGHT_OPACITY
    }
    return 0.03
  }

  const nodeDimmed = (nodeId: string) => {
    if (!selectedNodeId) return false
    if (nodeId === selectedNodeId) return false
    return !connectedNodeIds.has(nodeId)
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="absolute inset-0"
    >
      <defs>
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <filter key={cat} id={`glow-${cat}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor={color} floodOpacity="0.4" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}
      </defs>

      {/* Edges */}
      {edges.map((edge) => (
        <line
          key={`${edge.source}-${edge.target}`}
          ref={(el) => {
            if (el) edgeRefs.current.set(`${edge.source}-${edge.target}`, el)
          }}
          stroke="#94a3b8"
          strokeWidth={1}
          opacity={edgeOpacity(edge)}
          style={{
            transition: selectedNodeId ? 'opacity 0.3s' : 'none',
          }}
        />
      ))}

      {/* Nodes */}
      {initialNodes.map((node) => {
        const r = nodeRadius(node.importance)
        const color = CATEGORY_COLORS[node.category]
        const dimmed = nodeDimmed(node.id)
        const isSelected = node.id === selectedNodeId

        return (
          <g key={node.id}>
            {/* Invisible hit target (min 20px radius) */}
            <circle
              cx={node.x}
              cy={node.y}
              r={Math.max(20, r)}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => {
                const current = simRef.current.nodes.find(n => n.id === node.id)
                if (current) onNodeTap(current)
              }}
            />
            {/* Visible node */}
            <circle
              ref={(el) => {
                if (el) nodeRefs.current.set(node.id, el)
              }}
              cx={node.x}
              cy={node.y}
              r={isSelected ? r * 1.3 : r}
              fill={color}
              opacity={dimmed ? 0.15 : 0.85}
              filter={`url(#glow-${node.category})`}
              style={{
                transition: selectedNodeId ? 'opacity 0.3s, r 0.2s' : 'none',
                pointerEvents: 'none',
              }}
            />
          </g>
        )
      })}
    </svg>
  )
}
