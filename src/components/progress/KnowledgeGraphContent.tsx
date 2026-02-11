'use client'

import { useState, useMemo, useCallback } from 'react'
import { RawGraphData, GraphNode, GraphCategory, PositionedNode, ClusterInfo } from './graph/types'
import { useGraphData } from './graph/useGraphData'
import { NodeDetail } from './graph/NodeDetail'
import { EmptyGraph } from './EmptyGraph'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { CATEGORY_COLORS, CATEGORY_LABELS, LAYOUT, nodeRadius } from './graph/constants'

interface KnowledgeGraphContentProps {
  rawData: RawGraphData
}

// Category display order — most actionable first
const CATEGORY_ORDER: GraphCategory[] = [
  'goals', 'skills', 'discoveries',
  'decisions', 'situation', 'blockers',
  'preferences', 'background', 'constraints',
]

export function KnowledgeGraphContent({ rawData }: KnowledgeGraphContentProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const { nodes, edges } = useGraphData(rawData)

  // Group nodes by category, sorted by importance desc
  const categoryGroups = useMemo(() => {
    const groups = new Map<GraphCategory, GraphNode[]>()
    for (const node of nodes) {
      const group = groups.get(node.category) || []
      group.push(node)
      groups.set(node.category, group)
    }
    for (const [, group] of groups) {
      group.sort((a, b) => b.importance - a.importance)
    }
    return groups
  }, [nodes])

  const activeCategories = useMemo(
    () => CATEGORY_ORDER.filter(cat => categoryGroups.has(cat)),
    [categoryGroups]
  )

  // Structured layout — position nodes in category clusters on a grid
  const layout = useMemo(() => {
    const {
      NODES_PER_ROW, NODE_H_SPACING, NODE_V_SPACING,
      CLUSTER_PADDING_X, CLUSTER_PADDING_Y,
      CLUSTER_H_GAP, CLUSTER_V_GAP,
      CANVAS_PADDING, CLUSTER_HEADER_HEIGHT, CLUSTER_COLS,
    } = LAYOUT

    const clusters: ClusterInfo[] = []
    const positioned: PositionedNode[] = []

    // Calculate each cluster's dimensions
    const clusterMeta = new Map<GraphCategory, { rows: number; width: number; height: number }>()
    for (const cat of activeCategories) {
      const count = (categoryGroups.get(cat) || []).length
      const rows = Math.ceil(count / NODES_PER_ROW)
      const width = CLUSTER_PADDING_X * 2 + (NODES_PER_ROW - 1) * NODE_H_SPACING
      const height = CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING_Y * 2 + Math.max(0, rows - 1) * NODE_V_SPACING
      clusterMeta.set(cat, { rows, width, height })
    }

    // Distribute categories across columns (round-robin)
    const cols: GraphCategory[][] = Array.from({ length: CLUSTER_COLS }, () => [])
    for (let i = 0; i < activeCategories.length; i++) {
      cols[i % CLUSTER_COLS].push(activeCategories[i])
    }

    const maxClusterWidth = clusterMeta.size > 0
      ? Math.max(...Array.from(clusterMeta.values()).map(m => m.width))
      : 260

    let canvasWidth = 0
    let canvasHeight = 0

    for (let col = 0; col < CLUSTER_COLS; col++) {
      let y = CANVAS_PADDING
      const x = CANVAS_PADDING + col * (maxClusterWidth + CLUSTER_H_GAP)

      for (const cat of cols[col]) {
        const meta = clusterMeta.get(cat)!
        clusters.push({
          category: cat,
          x,
          y,
          width: maxClusterWidth,
          height: meta.height,
        })

        // Position nodes within cluster
        const group = categoryGroups.get(cat) || []
        for (let i = 0; i < group.length; i++) {
          const row = Math.floor(i / NODES_PER_ROW)
          const nodeCol = i % NODES_PER_ROW

          // Center the last row if it has fewer nodes
          const nodesInThisRow = Math.min(NODES_PER_ROW, group.length - row * NODES_PER_ROW)
          const rowWidth = (nodesInThisRow - 1) * NODE_H_SPACING
          const rowStartX = x + (maxClusterWidth - rowWidth) / 2

          positioned.push({
            ...group[i],
            x: rowStartX + nodeCol * NODE_H_SPACING,
            y: y + CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING_Y + row * NODE_V_SPACING,
          })
        }

        y += meta.height + CLUSTER_V_GAP
      }

      canvasHeight = Math.max(canvasHeight, y - CLUSTER_V_GAP + CANVAS_PADDING)
      canvasWidth = Math.max(canvasWidth, x + maxClusterWidth + CANVAS_PADDING)
    }

    return { clusters, positioned, canvasWidth, canvasHeight }
  }, [activeCategories, categoryGroups])

  // Node position lookup for edges
  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const n of layout.positioned) {
      map.set(n.id, { x: n.x, y: n.y })
    }
    return map
  }, [layout.positioned])

  // Selection state
  const connectedNodeIds = useMemo(() => {
    if (!selectedNode) return new Set<string>()
    const ids = new Set<string>()
    for (const edge of edges) {
      if (edge.source === selectedNode.id) ids.add(edge.target)
      if (edge.target === selectedNode.id) ids.add(edge.source)
    }
    return ids
  }, [selectedNode, edges])

  const connectedNodes = useMemo(() => {
    if (!selectedNode) return []
    return nodes.filter(n => connectedNodeIds.has(n.id))
  }, [selectedNode, connectedNodeIds, nodes])

  const handleNodeTap = useCallback((node: GraphNode) => {
    setSelectedNode(prev => (prev?.id === node.id ? null : node))
  }, [])

  const handleClose = useCallback(() => {
    setSelectedNode(null)
  }, [])

  // Empty state
  if (nodes.length < 3) {
    return (
      <>
        <EmptyGraph />
        <div className="fixed bottom-0 left-0 right-0 z-30">
          <BottomNavigation />
        </div>
      </>
    )
  }

  const { clusters, positioned, canvasWidth, canvasHeight } = layout

  const edgeOpacity = (source: string, target: string) => {
    if (!selectedNode) return 0.1
    if (source === selectedNode.id || target === selectedNode.id) return 0.5
    return 0.03
  }

  const nodeDimmed = (nodeId: string) => {
    if (!selectedNode) return false
    if (nodeId === selectedNode.id) return false
    return !connectedNodeIds.has(nodeId)
  }

  return (
    <div className="fixed inset-0 bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-12 pb-3 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/50 z-10">
        <h1 className="text-slate-200 text-base font-semibold tracking-tight">
          Knowledge Network
        </h1>
        <p className="text-slate-500 text-xs mt-0.5 font-mono">
          {nodes.length} nodes · {edges.length} connections
        </p>
      </div>

      {/* Scrollable canvas */}
      <div className="flex-1 overflow-auto" style={{ paddingBottom: 80 }}>
        <svg
          width={canvasWidth}
          height={canvasHeight}
          style={{ display: 'block' }}
        >
          <defs>
            {/* Dot grid */}
            <pattern id="dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="12" cy="12" r="0.5" fill="#94a3b8" opacity="0.1" />
            </pattern>

            {/* Glow filters per category */}
            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
              <filter key={cat} id={`glow-${cat}`} x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor={color} floodOpacity="0.25" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}

            {/* Selected node pulse */}
            <style>{`
              @keyframes node-pulse {
                0%, 100% { opacity: 0.3; }
                50% { opacity: 0.1; }
              }
            `}</style>
          </defs>

          {/* Background grid */}
          <rect width={canvasWidth} height={canvasHeight} fill="url(#dot-grid)" />

          {/* Category cluster backgrounds */}
          {clusters.map(cluster => {
            const color = CATEGORY_COLORS[cluster.category]
            return (
              <g key={`cluster-${cluster.category}`}>
                {/* Cluster region */}
                <rect
                  x={cluster.x}
                  y={cluster.y}
                  width={cluster.width}
                  height={cluster.height}
                  rx={12}
                  fill={color}
                  fillOpacity={0.03}
                  stroke={color}
                  strokeOpacity={0.08}
                  strokeWidth={1}
                />
                {/* Category label */}
                <text
                  x={cluster.x + 14}
                  y={cluster.y + 20}
                  fill={color}
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                  opacity={0.6}
                  letterSpacing="1.2"
                >
                  {CATEGORY_LABELS[cluster.category].toUpperCase()}
                </text>
              </g>
            )
          })}

          {/* Edges — subtle curved lines */}
          {edges.map(edge => {
            const s = nodePositions.get(edge.source)
            const t = nodePositions.get(edge.target)
            if (!s || !t) return null

            const opacity = edgeOpacity(edge.source, edge.target)
            const dx = t.x - s.x
            const dy = t.y - s.y
            const len = Math.sqrt(dx * dx + dy * dy)
            if (len < 1) return null

            // Slight curve perpendicular to the line
            const mx = (s.x + t.x) / 2
            const my = (s.y + t.y) / 2
            const offset = Math.min(25, len * 0.12)
            const cx = mx + (-dy / len) * offset
            const cy = my + (dx / len) * offset

            return (
              <path
                key={`${edge.source}-${edge.target}`}
                d={`M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={1}
                opacity={opacity}
                style={{
                  transition: selectedNode ? 'opacity 0.3s' : 'none',
                }}
              />
            )
          })}

          {/* Nodes */}
          {positioned.map(node => {
            const r = nodeRadius(node.importance)
            const color = CATEGORY_COLORS[node.category]
            const dimmed = nodeDimmed(node.id)
            const isSelected = node.id === selectedNode?.id
            const displayR = isSelected ? r * 1.3 : r

            return (
              <g key={node.id} transform={`translate(${node.x},${node.y})`}>
                {/* Hit target */}
                <circle
                  r={Math.max(24, r + 8)}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleNodeTap(node)}
                />

                {/* Selected outer ring */}
                {isSelected && (
                  <circle
                    r={displayR + 8}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    style={{ animation: 'node-pulse 2s ease-in-out infinite' }}
                  />
                )}

                {/* Node circle */}
                <circle
                  r={displayR}
                  fill={color}
                  fillOpacity={isSelected ? 0.2 : 0.06}
                  stroke={color}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  opacity={dimmed ? 0.15 : 0.9}
                  filter={!dimmed ? `url(#glow-${node.category})` : undefined}
                  style={{
                    transition: selectedNode ? 'opacity 0.3s, r 0.2s' : 'none',
                    pointerEvents: 'none',
                  }}
                />

                {/* Label below node */}
                {!dimmed && (
                  <text
                    y={displayR + 14}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                    opacity={isSelected ? 0.9 : 0.5}
                    style={{ pointerEvents: 'none' }}
                  >
                    {node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Node detail sheet */}
      <NodeDetail
        node={selectedNode}
        connectedNodes={connectedNodes}
        onClose={handleClose}
      />

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <BottomNavigation />
      </div>
    </div>
  )
}
