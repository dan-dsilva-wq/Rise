'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Target, Hammer, Rocket,
  PauseCircle, MoreVertical, Pencil, Trash2, Play, Sparkles, Compass, X, Check
} from 'lucide-react'
import Link from 'next/link'
import { MilestoneList } from './MilestoneList'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useProject } from '@/lib/hooks/useProject'
import { useUser } from '@/lib/hooks/useUser'
import type { Profile, Project, Milestone } from '@/lib/supabase/types'

interface ProjectDetailContentProps {
  profile: Profile | null
  initialProject: Project | null
  initialMilestones: Milestone[]
}

const statusConfig = {
  discovery: { label: 'Discovery', icon: Target, color: 'text-purple-400', next: 'planning' },
  planning: { label: 'Planning', icon: Target, color: 'text-blue-400', next: 'building' },
  building: { label: 'Building', icon: Hammer, color: 'text-amber-400', next: 'launched' },
  launched: { label: 'Launched', icon: Rocket, color: 'text-teal-400', next: null },
  paused: { label: 'Paused', icon: PauseCircle, color: 'text-slate-400', next: 'building' },
}

export function ProjectDetailContent({
  profile: initialProfile,
  initialProject,
  initialMilestones,
}: ProjectDetailContentProps) {
  const router = useRouter()
  const { user, profile, refreshProfile } = useUser()
  const {
    project,
    milestones,
    loading,
    updateProject,
    deleteProject,
    addMilestone,
    completeMilestone,
    uncompleteMilestone,
    deleteMilestone,
    reorderMilestones,
    promoteIdea,
    addIdea,
    setFocusLevel,
  } = useProject(initialProject?.id, user?.id, initialProject, initialMilestones)

  const [showMenu, setShowMenu] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(initialProject?.name || '')
  const [editDescription, setEditDescription] = useState(initialProject?.description || '')
  const [showAddMilestone, setShowAddMilestone] = useState(false)
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')
  const [showAddIdea, setShowAddIdea] = useState(false)
  const [newIdeaTitle, setNewIdeaTitle] = useState('')
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState<string | null>(null)
  const [milestoneError, setMilestoneError] = useState<string | null>(null)
  const [ideaError, setIdeaError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddingMilestone, setIsAddingMilestone] = useState(false)
  const [isAddingIdea, setIsAddingIdea] = useState(false)
  // Use data from hook - it's initialized with server data
  const currentProject = project
  const currentMilestones = milestones

  if (!currentProject) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400">Project not found</p>
          <Link href="/projects">
            <Button variant="secondary" className="mt-4">
              Back to Projects
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const status = statusConfig[currentProject.status]
  const StatusIcon = status.icon

  const handleSaveEdit = async () => {
    setIsSaving(true)
    try {
      await updateProject({
        name: editName,
        description: editDescription,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleStatusChange = async (newStatus: Project['status']) => {
    await updateProject({ status: newStatus })
    setShowMenu(false)
  }

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      const success = await deleteProject()
      if (success) {
        router.push('/projects')
      } else {
        setErrorToast('Failed to delete project. Please try again.')
        setTimeout(() => setErrorToast(null), 5000)
      }
    }
  }

  const handleCompleteMilestone = async (milestoneId: string) => {
    const xp = await completeMilestone(milestoneId)
    if (xp > 0) {
      await refreshProfile()
    }
    return xp
  }

  const handleUncompleteMilestone = async (milestoneId: string) => {
    const xp = await uncompleteMilestone(milestoneId)
    if (xp > 0) {
      await refreshProfile()
    }
    return xp
  }

  const handleAddMilestone = async () => {
    if (!newMilestoneTitle.trim()) {
      setMilestoneError('Please enter a milestone title')
      return
    }

    setMilestoneError(null)
    setIsAddingMilestone(true)
    try {
      await addMilestone({
        title: newMilestoneTitle,
        description: '',
      })
      setNewMilestoneTitle('')
      setShowAddMilestone(false)
      setSuccessToast('Milestone added')
      setTimeout(() => setSuccessToast(null), 2000)
    } finally {
      setIsAddingMilestone(false)
    }
  }

  const handleAddIdea = async () => {
    if (!newIdeaTitle.trim()) {
      setIdeaError('Please enter an idea')
      return
    }

    setIdeaError(null)
    setIsAddingIdea(true)
    try {
      await addIdea(newIdeaTitle.trim())
      setNewIdeaTitle('')
      setShowAddIdea(false)
      setSuccessToast('Idea saved')
      setTimeout(() => setSuccessToast(null), 2000)
    } finally {
      setIsAddingIdea(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              className="p-2 -ml-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-white font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  autoFocus
                />
              ) : (
                <h1 className="text-xl font-bold text-slate-100 truncate">
                  {currentProject.name}
                </h1>
              )}
              <div className={`text-sm ${status.color} flex items-center gap-1`}>
                <StatusIcon className="w-4 h-4" />
                {status.label}
              </div>
            </div>
          </div>

          {/* Menu Button */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-full hover:bg-slate-800 transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-slate-400" />
            </button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50"
                >
                  <button
                    onClick={() => {
                      setIsEditing(true)
                      setShowMenu(false)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit Details
                  </button>

                  <Link
                    href="/path-finder"
                    className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Compass className="w-4 h-4" />
                    Rethink in Path Finder
                  </Link>

                  {status.next && (
                    <button
                      onClick={() => handleStatusChange(status.next as Project['status'])}
                      className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                    >
                      <Play className="w-4 h-4" />
                      Move to {statusConfig[status.next as keyof typeof statusConfig].label}
                    </button>
                  )}

                  {currentProject.status !== 'paused' && currentProject.status !== 'launched' && (
                    <button
                      onClick={() => handleStatusChange('paused')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                    >
                      <PauseCircle className="w-4 h-4" />
                      Pause Project
                    </button>
                  )}

                  <button
                    onClick={handleDelete}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Project
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Edit Mode */}
        {isEditing && (
          <Card>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 block mb-1">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white min-h-[100px] focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="What are you building?"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit} isLoading={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Description - subtle, only when exists and not editing */}
        {!isEditing && currentProject.description && (
          <p className="text-slate-400 text-sm px-1">{currentProject.description}</p>
        )}

        {/* Work on Project - single clear action */}
        <Link href={`/projects/${currentProject.id}/build`}>
          <Card className="bg-gradient-to-br from-teal-900/40 to-slate-800/50 border-teal-700/30 hover:border-teal-500/50 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-teal-500/20">
                <Sparkles className="w-6 h-6 text-teal-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-white">Work on Project</h3>
                <p className="text-sm text-slate-400">Chat with AI to make progress</p>
              </div>
              <ChevronLeft className="w-5 h-5 text-slate-500 rotate-180" />
            </div>
          </Card>
        </Link>

        {/* Milestones */}
        <Card>
          <MilestoneList
            milestones={currentMilestones}
            projectId={currentProject.id}
            project={currentProject}
            userId={user?.id}
            onComplete={handleCompleteMilestone}
            onUncomplete={handleUncompleteMilestone}
            onSetFocus={setFocusLevel}
            onPromote={promoteIdea}
            onAdd={() => setShowAddMilestone(true)}
            onAddIdea={() => setShowAddIdea(true)}
            onDelete={deleteMilestone}
            showAddButton
            isEditable
            useBottomSheet
          />

          {/* Add Milestone Form */}
          <AnimatePresence>
            {showAddMilestone && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 pt-4 border-t border-slate-700"
              >
                <div className="mb-3">
                  <input
                    type="text"
                    value={newMilestoneTitle}
                    onChange={(e) => {
                      setNewMilestoneTitle(e.target.value)
                      if (milestoneError) setMilestoneError(null)
                    }}
                    placeholder="Milestone title..."
                    className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:border-transparent ${
                      milestoneError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-slate-700 focus:ring-teal-500'
                    }`}
                    autoFocus
                    aria-invalid={milestoneError ? 'true' : 'false'}
                    aria-describedby={milestoneError ? 'milestone-error' : undefined}
                  />
                  {milestoneError && (
                    <p id="milestone-error" className="mt-1 text-sm text-red-400" role="alert">
                      {milestoneError}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => {
                    setShowAddMilestone(false)
                    setMilestoneError(null)
                    setNewMilestoneTitle('')
                  }} disabled={isAddingMilestone}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddMilestone} isLoading={isAddingMilestone}>
                    {isAddingMilestone ? 'Adding...' : 'Add Milestone'}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Add Idea Form */}
          <AnimatePresence>
            {showAddIdea && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 pt-4 border-t border-yellow-700/30"
              >
                <div className="mb-3">
                  <input
                    type="text"
                    value={newIdeaTitle}
                    onChange={(e) => {
                      setNewIdeaTitle(e.target.value)
                      if (ideaError) setIdeaError(null)
                    }}
                    placeholder="Idea for later..."
                    className={`w-full bg-yellow-500/5 border rounded-lg px-3 py-2 text-white placeholder-yellow-400/50 focus:outline-none focus:ring-2 focus:border-transparent ${
                      ideaError
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-yellow-500/30 focus:ring-yellow-500'
                    }`}
                    autoFocus
                    aria-invalid={ideaError ? 'true' : 'false'}
                    aria-describedby={ideaError ? 'idea-error' : undefined}
                  />
                  {ideaError && (
                    <p id="idea-error" className="mt-1 text-sm text-red-400" role="alert">
                      {ideaError}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => {
                    setShowAddIdea(false)
                    setIdeaError(null)
                    setNewIdeaTitle('')
                  }} disabled={isAddingIdea}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddIdea} isLoading={isAddingIdea} className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border-yellow-500/30">
                    {isAddingIdea ? 'Adding...' : 'Add Idea'}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Success Toast */}
        <AnimatePresence>
          {successToast && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="fixed bottom-28 left-4 right-4 max-w-lg mx-auto px-4 py-3 bg-teal-500/20 border border-teal-500/30 rounded-lg flex items-center gap-2"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 500, damping: 25 }}
              >
                <Check className="w-4 h-4 text-teal-400 flex-shrink-0" />
              </motion.div>
              <span className="text-sm text-teal-400">{successToast}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Toast */}
        <AnimatePresence>
          {errorToast && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-28 left-4 right-4 max-w-lg mx-auto px-4 py-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2"
            >
              <X className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-400 flex-1">{errorToast}</span>
              <button
                onClick={() => setErrorToast(null)}
                className="text-red-400 hover:text-red-300"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
