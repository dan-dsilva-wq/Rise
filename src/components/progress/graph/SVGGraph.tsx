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
  const edgeRefs = useRef<Map<string, SVGGElement>>(new Map())
  // Ref to the <g> group wrapping each node — moving this moves both hit target and visible circle
  const nodeGroupRefs = useRef<Map<string, SVGGElement>>(new Map())

  const onTick = useCallback(() => {
    const state = simRef.current
    if (!state) return

    const { nodes } = state
    const nodeMap = new Map<string, GraphNode>()
    for (const n of nodes) {
      nodeMap.set(n.id, n)
      const group = nodeGroupRefs.current.get(n.id)
      if (group) {
        group.setAttribute('transform', `translate(${n.x},${n.y})`)
      }
    }

    for (const edge of edges) {
      const group = edgeRefs.current.get(`${edge.source}-${edge.target}`)
      const s = nodeMap.get(edge.source)
      const t = nodeMap.get(edge.target)
      if (group && s && t) {
        const line = group.querySelector('line')
        const dot1 = group.querySelector('.edge-dot-source') as SVGCircleElement | null
        const dot2 = group.querySelector('.edge-dot-target') as SVGCircleElement | null
        if (line) {
          line.setAttribute('x1', String(s.x))
          line.setAttribute('y1', String(s.y))
          line.setAttribute('x2', String(t.x))
          line.setAttribute('y2', String(t.y))
        }
        if (dot1) {
          dot1.setAttribute('cx', String(s.x))
          dot1.setAttribute('cy', String(s.y))
        }
        if (dot2) {
          dot2.setAttribute('cx', String(t.x))
          dot2.setAttribute('cy', String(t.y))
        }
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

  // Truncate label for inline SVG text
  const truncateLabel = (label: string, maxLen: number) => {
    if (label.length <= maxLen) return label
    return label.slice(0, maxLen - 1) + '…'
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="absolute inset-0"
    >
      <defs>
        {/* Dot grid background pattern */}
        <pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="0.5" fill="#94a3b8" opacity="0.15" />
        </pattern>

        {/* Tighter glow filters */}
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <filter key={cat} id={`glow-${cat}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feFlood floodColor={color} floodOpacity="0.25" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}

        {/* Pulse animation for selected node */}
        <style>{`
          @keyframes pulse-ring {
            0% { opacity: 0.6; r: inherit; }
            100% { opacity: 0; r: 30; }
          }
        `}</style>
      </defs>

      {/* Dot grid background */}
      <rect width={width} height={height} fill="url(#dot-grid)" />

      {/* Edges with terminal dots */}
      {edges.map((edge) => {
        const opacity = edgeOpacity(edge)
        return (
          <g
            key={`${edge.source}-${edge.target}`}
            ref={(el) => {
              if (el) edgeRefs.current.set(`${edge.source}-${edge.target}`, el)
            }}
          >
            <line
              stroke="#94a3b8"
              strokeWidth={1}
              opacity={opacity}
              style={{
                transition: selectedNodeId ? 'opacity 0.3s' : 'none',
              }}
            />
            {/* Terminal dots — molecular bond style */}
            <circle
              className="edge-dot-source"
              r={1.5}
              fill="#94a3b8"
              opacity={opacity}
              style={{
                transition: selectedNodeId ? 'opacity 0.3s' : 'none',
              }}
            />
            <circle
              className="edge-dot-target"
              r={1.5}
              fill="#94a3b8"
              opacity={opacity}
              style={{
                transition: selectedNodeId ? 'opacity 0.3s' : 'none',
              }}
            />
          </g>
        )
      })}

      {/* Nodes — ring style with optional inline labels */}
      {initialNodes.map((node) => {
        const r = nodeRadius(node.importance)
        const color = CATEGORY_COLORS[node.category]
        const dimmed = nodeDimmed(node.id)
        const isSelected = node.id === selectedNodeId
        const showLabel = node.importance >= 7

        return (
          <g
            key={node.id}
            ref={(el) => {
              if (el) nodeGroupRefs.current.set(node.id, el)
            }}
            transform={`translate(${node.x},${node.y})`}
          >
            {/* Invisible hit target (min 20px radius) */}
            <circle
              cx={0}
              cy={0}
              r={Math.max(20, r)}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => {
                const current = simRef.current.nodes.find(n => n.id === node.id)
                if (current) onNodeTap(current)
              }}
            />

            {/* Selected: outer pulse ring */}
            {isSelected && (
              <circle
                cx={0}
                cy={0}
                r={r * 1.6}
                fill="none"
                stroke={color}
                strokeWidth={1}
                opacity={0.4}
                style={{
                  animation: 'pulse-ring 2s ease-out infinite',
                }}
              />
            )}

            {/* Ring node: thin stroke + very faint fill */}
            <circle
              cx={0}
              cy={0}
              r={isSelected ? r * 1.2 : r}
              fill={color}
              fillOpacity={isSelected ? 0.15 : 0.05}
              stroke={color}
              strokeWidth={isSelected ? 2 : 1.5}
              opacity={dimmed ? 0.15 : 0.85}
              filter={`url(#glow-${node.category})`}
              style={{
                transition: selectedNodeId ? 'opacity 0.3s' : 'none',
                pointerEvents: 'none',
              }}
            />

            {/* Inline label for high-importance nodes */}
            {showLabel && !dimmed && (
              <text
                x={0}
                y={r + 12}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="9"
                fontFamily="monospace"
                opacity={0.6}
                style={{ pointerEvents: 'none' }}
              >
                {truncateLabel(node.label, 18)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
