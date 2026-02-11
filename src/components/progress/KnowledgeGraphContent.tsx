'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { RawGraphData, GraphNode, GraphCategory } from './graph/types'
import { useGraphData } from './graph/useGraphData'
import { SVGGraph } from './graph/SVGGraph'
import { NodeDetail } from './graph/NodeDetail'
import { CategoryLegend } from './graph/CategoryLegend'
import { EmptyGraph } from './EmptyGraph'
import { BottomNavigation } from '@/components/ui/BottomNavigation'

interface KnowledgeGraphContentProps {
  rawData: RawGraphData
}

function useWindowSize() {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    function update() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return size
}

export function KnowledgeGraphContent({ rawData }: KnowledgeGraphContentProps) {
  const { width, height } = useWindowSize()
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  const { nodes, edges } = useGraphData(rawData, width, height)

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
    return nodes.filter(n => connectedNodeIds.has(n.id))
  }, [selectedNode, connectedNodeIds, nodes])

  // Active categories for legend
  const activeCategories = useMemo(() => {
    const cats = new Set<GraphCategory>()
    for (const n of nodes) cats.add(n.category)
    return cats
  }, [nodes])

  const handleNodeTap = useCallback((node: GraphNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
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

  if (width === 0 || height === 0) return null

  return (
    <div className="fixed inset-0 bg-slate-900">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-12 pb-3">
        <h1 className="text-slate-300 text-sm font-medium tracking-wide">
          What Rise Knows
        </h1>
        <p className="text-slate-600 text-xs mt-0.5">
          {nodes.length} things learned
        </p>
      </div>

      {/* Graph */}
      <SVGGraph
        initialNodes={nodes}
        edges={edges}
        width={width}
        height={height}
        selectedNodeId={selectedNode?.id ?? null}
        connectedNodeIds={connectedNodeIds}
        onNodeTap={handleNodeTap}
      />

      {/* Legend */}
      <CategoryLegend activeCategories={activeCategories} />

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
