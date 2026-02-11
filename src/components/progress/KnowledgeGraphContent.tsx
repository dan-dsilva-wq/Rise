'use client'

import { useState, useMemo, useCallback } from 'react'
import { RawGraphData, GraphNode, GraphCategory } from './graph/types'
import { useGraphData } from './graph/useGraphData'
import { NodeDetail } from './graph/NodeDetail'
import { EmptyGraph } from './EmptyGraph'
import { BottomNavigation } from '@/components/ui/BottomNavigation'
import { CATEGORY_COLORS, CATEGORY_LABELS } from './graph/constants'

interface KnowledgeGraphContentProps {
  rawData: RawGraphData
}

// Category display order — most actionable first
const CATEGORY_ORDER: GraphCategory[] = [
  'goals',
  'skills',
  'discoveries',
  'decisions',
  'situation',
  'blockers',
  'preferences',
  'background',
  'constraints',
]

function ImportanceDots({ importance }: { importance: number }) {
  const clamped = Math.max(1, Math.min(10, importance))
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className="w-[5px] h-[5px] rounded-full"
          style={{
            backgroundColor: i < clamped ? 'rgba(148, 163, 184, 0.5)' : 'rgba(148, 163, 184, 0.1)',
          }}
        />
      ))}
    </div>
  )
}

function NodeCard({
  node,
  isSelected,
  connectionCount,
  onTap,
}: {
  node: GraphNode
  isSelected: boolean
  connectionCount: number
  onTap: () => void
}) {
  const color = CATEGORY_COLORS[node.category]

  return (
    <button
      onClick={onTap}
      className="w-full text-left transition-all duration-200"
      style={{
        background: isSelected
          ? 'rgba(30, 41, 59, 0.9)'
          : 'rgba(30, 41, 59, 0.5)',
        borderLeft: `3px solid ${isSelected ? color : 'rgba(148, 163, 184, 0.15)'}`,
        borderRadius: '6px',
        padding: '10px 12px',
        boxShadow: isSelected
          ? `0 0 12px ${color}20, 0 1px 3px rgba(0,0,0,0.3)`
          : '0 1px 2px rgba(0,0,0,0.2)',
      }}
    >
      <p
        className="text-[13px] leading-[1.4] mb-2"
        style={{
          color: isSelected ? '#e2e8f0' : '#94a3b8',
        }}
      >
        {node.label}
      </p>
      <div className="flex items-center justify-between">
        <ImportanceDots importance={node.importance} />
        {connectionCount > 0 && (
          <span className="text-[10px] text-slate-600 font-mono">
            {connectionCount} link{connectionCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  )
}

function CategoryColumn({
  category,
  nodes,
  selectedNodeId,
  connectionCounts,
  onNodeTap,
}: {
  category: GraphCategory
  nodes: GraphNode[]
  selectedNodeId: string | null
  connectionCounts: Map<string, number>
  onNodeTap: (node: GraphNode) => void
}) {
  const color = CATEGORY_COLORS[category]

  return (
    <div className="flex-shrink-0 w-[240px]">
      {/* Column header */}
      <div className="mb-3 px-1">
        <div
          className="h-[2px] w-full rounded-full mb-2.5"
          style={{ backgroundColor: color, opacity: 0.6 }}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-[7px] h-[7px] rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-[12px] font-medium text-slate-300 tracking-wide">
              {CATEGORY_LABELS[category]}
            </span>
          </div>
          <span className="text-[11px] text-slate-600 font-mono">
            {nodes.length}
          </span>
        </div>
      </div>

      {/* Node cards */}
      <div className="space-y-2">
        {nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            isSelected={node.id === selectedNodeId}
            connectionCount={connectionCounts.get(node.id) || 0}
            onTap={() => onNodeTap(node)}
          />
        ))}
      </div>
    </div>
  )
}

export function KnowledgeGraphContent({ rawData }: KnowledgeGraphContentProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  const { nodes, edges } = useGraphData(rawData)

  // Group nodes by category, sorted by importance
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

  // Only show categories that have nodes, in preferred order
  const activeCategories = useMemo(
    () => CATEGORY_ORDER.filter((cat) => categoryGroups.has(cat)),
    [categoryGroups]
  )

  // Connection count per node
  const connectionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const edge of edges) {
      counts.set(edge.source, (counts.get(edge.source) || 0) + 1)
      counts.set(edge.target, (counts.get(edge.target) || 0) + 1)
    }
    return counts
  }, [edges])

  // Connected node IDs for selection highlighting
  const connectedNodeIds = useMemo(() => {
    if (!selectedNode) return new Set<string>()
    const ids = new Set<string>()
    for (const edge of edges) {
      if (edge.source === selectedNode.id) ids.add(edge.target)
      if (edge.target === selectedNode.id) ids.add(edge.source)
    }
    return ids
  }, [selectedNode, edges])

  // Connected node objects for the detail sheet
  const connectedNodes = useMemo(() => {
    if (!selectedNode) return []
    return nodes.filter((n) => connectedNodeIds.has(n.id))
  }, [selectedNode, connectedNodeIds, nodes])

  const handleNodeTap = useCallback((node: GraphNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node))
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

  return (
    <div className="fixed inset-0 bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-12 pb-4 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800/60 z-10">
        <h1 className="text-slate-200 text-base font-semibold tracking-tight">
          Knowledge Network
        </h1>
        <p className="text-slate-500 text-xs mt-0.5 font-mono">
          {nodes.length} nodes · {edges.length} connections
        </p>
      </div>

      {/* Scrollable node map — scrolls both X and Y */}
      <div
        className="flex-1 overflow-auto"
        style={{
          paddingBottom: '100px', // space for bottom nav + detail sheet
        }}
      >
        <div className="flex gap-3 p-4 min-h-full">
          {activeCategories.map((category) => (
            <CategoryColumn
              key={category}
              category={category}
              nodes={categoryGroups.get(category) || []}
              selectedNodeId={selectedNode?.id ?? null}
              connectionCounts={connectionCounts}
              onNodeTap={handleNodeTap}
            />
          ))}
          {/* Right padding spacer */}
          <div className="flex-shrink-0 w-2" />
        </div>
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
