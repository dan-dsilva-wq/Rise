'use client'

import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, RotateCcw, Map } from 'lucide-react'
import { Node } from './Node'
import { PathSuggestion } from './PathSuggestion'
import { getNode, isSuggestion, type TreeOption } from '@/lib/path-finder/tree-data'
import { Button } from '@/components/ui/Button'

interface TreeViewProps {
  currentNodeId: string
  visitedNodes: string[]
  onNavigate: (nodeId: string, visited: string[]) => void
  onSelectPath: (nodeId: string) => void
  onStartProject: (nodeId: string) => Promise<void>
}

export function TreeView({
  currentNodeId,
  visitedNodes,
  onNavigate,
  onSelectPath,
  onStartProject,
}: TreeViewProps) {
  const [isLoading, setIsLoading] = useState(false)
  const currentNode = getNode(currentNodeId)

  const handleSelectOption = useCallback((option: TreeOption) => {
    const newVisited = [...visitedNodes, currentNodeId]
    onNavigate(option.nextNodeId, newVisited)

    if (isSuggestion(option.nextNodeId)) {
      onSelectPath(option.nextNodeId)
    }
  }, [currentNodeId, visitedNodes, onNavigate, onSelectPath])

  const handleGoBack = useCallback(() => {
    if (visitedNodes.length > 0) {
      const newVisited = [...visitedNodes]
      const previousNodeId = newVisited.pop()!
      onNavigate(previousNodeId, newVisited)
    }
  }, [visitedNodes, onNavigate])

  const handleReset = useCallback(() => {
    onNavigate('start', [])
    onSelectPath('')
  }, [onNavigate, onSelectPath])

  const handleStartProject = useCallback(async () => {
    setIsLoading(true)
    try {
      await onStartProject(currentNodeId)
    } finally {
      setIsLoading(false)
    }
  }, [currentNodeId, onStartProject])

  if (!currentNode) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Node not found</p>
        <Button variant="secondary" onClick={handleReset} className="mt-4">
          Start Over
        </Button>
      </div>
    )
  }

  // Build breadcrumb path
  const breadcrumbs = visitedNodes
    .map(id => getNode(id))
    .filter(Boolean)
    .map(node => node!.title.split(' ').slice(0, 3).join(' '))

  return (
    <div className="w-full">
      {/* Navigation Bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          {visitedNodes.length > 0 && (
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={handleGoBack}
              className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </motion.button>
          )}

          {/* Progress indicator */}
          <div className="flex items-center gap-1.5">
            <Map className="w-4 h-4 text-teal-500" />
            <span className="text-sm text-slate-400">
              {visitedNodes.length === 0 ? 'Start' : `Step ${visitedNodes.length + 1}`}
            </span>
          </div>
        </div>

        {visitedNodes.length > 0 && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Start Over
          </motion.button>
        )}
      </div>

      {/* Breadcrumb Trail */}
      {breadcrumbs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-1 mb-6 text-xs text-slate-500"
        >
          <span className="text-slate-600">Path:</span>
          {breadcrumbs.map((crumb, index) => (
            <span key={index} className="flex items-center">
              {index > 0 && <span className="mx-1 text-slate-700">/</span>}
              <span className="text-slate-400">{crumb}</span>
            </span>
          ))}
        </motion.div>
      )}

      {/* Current Node Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentNodeId}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
        >
          {currentNode.type === 'suggestion' ? (
            <PathSuggestion
              node={currentNode}
              onStartProject={handleStartProject}
              onGoBack={handleGoBack}
              isLoading={isLoading}
            />
          ) : (
            <Node
              node={currentNode}
              onSelectOption={handleSelectOption}
              isActive={!isLoading}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
