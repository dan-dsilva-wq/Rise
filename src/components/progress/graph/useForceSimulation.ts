import { useRef, useEffect, useCallback } from 'react'
import { GraphNode, GraphEdge } from './types'
import { PHYSICS, nodeRadius } from './constants'

interface SimulationState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  settled: boolean
  startTime: number
}

export function useForceSimulation(
  initialNodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  onTick: () => void
) {
  const stateRef = useRef<SimulationState>({
    nodes: [],
    edges: [],
    settled: false,
    startTime: 0,
  })
  const rafRef = useRef<number>(0)

  // Build edge lookup for fast access
  const edgeMapRef = useRef<Map<string, Array<{ target: string; strength: number }>>>(new Map())

  // Init/reset when nodes or edges change
  useEffect(() => {
    const state = stateRef.current
    state.nodes = initialNodes.map(n => ({ ...n }))
    state.edges = edges
    state.settled = false
    state.startTime = performance.now()

    // Build adjacency map
    const map = new Map<string, Array<{ target: string; strength: number }>>()
    for (const edge of edges) {
      if (!map.has(edge.source)) map.set(edge.source, [])
      if (!map.has(edge.target)) map.set(edge.target, [])
      map.get(edge.source)!.push({ target: edge.target, strength: edge.strength })
      map.get(edge.target)!.push({ target: edge.source, strength: edge.strength })
    }
    edgeMapRef.current = map
  }, [initialNodes, edges])

  const simulate = useCallback(() => {
    const state = stateRef.current
    const { nodes } = state
    const cx = width / 2
    const cy = height / 2

    if (nodes.length === 0) {
      rafRef.current = requestAnimationFrame(simulate)
      return
    }

    if (!state.settled) {
      // --- Force simulation step ---

      // Reset accelerations
      const ax = new Float64Array(nodes.length)
      const ay = new Float64Array(nodes.length)

      // 1. Repulsion (O(n^2) — fine for <=200 nodes)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let dx = nodes[j].x - nodes[i].x
          let dy = nodes[j].y - nodes[i].y
          let dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = 1 }

          const force = PHYSICS.REPULSION / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force

          ax[i] -= fx
          ay[i] -= fy
          ax[j] += fx
          ay[j] += fy
        }
      }

      // 2. Spring forces (edges)
      const nodeIndex = new Map<string, number>()
      for (let i = 0; i < nodes.length; i++) nodeIndex.set(nodes[i].id, i)

      for (const edge of state.edges) {
        const si = nodeIndex.get(edge.source)
        const ti = nodeIndex.get(edge.target)
        if (si === undefined || ti === undefined) continue

        const dx = nodes[ti].x - nodes[si].x
        const dy = nodes[ti].y - nodes[si].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 0.1) continue

        const displacement = dist - PHYSICS.SPRING_LENGTH
        const force = PHYSICS.SPRING_STRENGTH * displacement * edge.strength
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force

        ax[si] += fx
        ay[si] += fy
        ax[ti] -= fx
        ay[ti] -= fy
      }

      // 3. Gravity toward center
      for (let i = 0; i < nodes.length; i++) {
        ax[i] += (cx - nodes[i].x) * PHYSICS.GRAVITY
        ay[i] += (cy - nodes[i].y) * PHYSICS.GRAVITY
      }

      // 4. Apply forces + damping
      let totalVelocity = 0
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].vx = (nodes[i].vx + ax[i]) * PHYSICS.DAMPING
        nodes[i].vy = (nodes[i].vy + ay[i]) * PHYSICS.DAMPING
        nodes[i].x += nodes[i].vx
        nodes[i].y += nodes[i].vy

        // Keep nodes in bounds (with padding)
        const r = nodeRadius(nodes[i].importance)
        const pad = r + 10
        nodes[i].x = Math.max(pad, Math.min(width - pad, nodes[i].x))
        nodes[i].y = Math.max(pad, Math.min(height - pad, nodes[i].y))

        totalVelocity += Math.abs(nodes[i].vx) + Math.abs(nodes[i].vy)
      }

      // Check if settled (after min 1s)
      const elapsed = performance.now() - state.startTime
      if (elapsed > 1000 && totalVelocity / nodes.length < PHYSICS.MIN_VELOCITY) {
        state.settled = true
      }
    } else {
      // Breathing animation — subtle sinusoidal float
      const t = performance.now() * PHYSICS.BREATHING_SPEED
      for (let i = 0; i < nodes.length; i++) {
        const phase = (i / nodes.length) * Math.PI * 2
        nodes[i].x += Math.sin(t + phase) * PHYSICS.BREATHING_AMPLITUDE * 0.016
        nodes[i].y += Math.cos(t + phase * 0.7) * PHYSICS.BREATHING_AMPLITUDE * 0.016
      }
    }

    onTick()
    rafRef.current = requestAnimationFrame(simulate)
  }, [width, height, onTick])

  // Start/stop the loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(simulate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [simulate])

  return stateRef
}
