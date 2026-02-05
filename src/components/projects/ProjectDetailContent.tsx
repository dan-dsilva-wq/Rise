'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Target, Hammer, Rocket,
  PauseCircle, MoreVertical, Pencil, Trash2, Play, Sparkles, Compass, X, Check, AlertTriangle
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  profile: initialProfile,
  initialProject,
  initialMilestones,
}: ProjectDetailContentProps) {
  const router = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user, profile } = useUser()
  const {
    project,
    milestones,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    loading,
    updateProject,
    deleteProject,
    addMilestone,
    completeMilestone,
    uncompleteMilestone,
    deleteMilestone,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    reorderMilestones,
    promoteIdea,
    addIdea,
    setFocusLevel,
  } = useProject(initialProject?.id, user?.id, initialProject, initialMilestones)

  const [showMenu, setShowMenu] = useState(false)
  const [focusedMenuIndex, setFocusedMenuIndex] = useState(-1)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuItemsRef = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>([])
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  // Use data from hook - it's initialized with server data
  const currentProject = project
  const currentMilestones = milestones

  // Calculate menu item count based on project state (for keyboard navigation)
  const getMenuItemCount = useCallback(() => {
    if (!currentProject) return 0
    const projectStatus = statusConfig[currentProject.status]
    let count = 2 // Edit Details + Rethink in Path Finder
    if (projectStatus.next) count++ // Move to next status
    if (currentProject.status !== 'paused' && currentProject.status !== 'launched') count++ // Pause Project
    count++ // Delete Project
    return count
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.status])

  // Click outside handler to close menu
  useEffect(() => {
    if (!showMenu) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target as Node)
      ) {
        setShowMenu(false)
        setFocusedMenuIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  // Keyboard navigation for menu
  useEffect(() => {
    if (!showMenu) return

    const menuItemCount = getMenuItemCount()

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          setShowMenu(false)
          setFocusedMenuIndex(-1)
          menuButtonRef.current?.focus()
          break
        case 'ArrowDown':
          event.preventDefault()
          setFocusedMenuIndex(prev => {
            const next = prev < menuItemCount - 1 ? prev + 1 : 0
            menuItemsRef.current[next]?.focus()
            return next
          })
          break
        case 'ArrowUp':
          event.preventDefault()
          setFocusedMenuIndex(prev => {
            const next = prev > 0 ? prev - 1 : menuItemCount - 1
            menuItemsRef.current[next]?.focus()
            return next
          })
          break
        case 'Home':
          event.preventDefault()
          setFocusedMenuIndex(0)
          menuItemsRef.current[0]?.focus()
          break
        case 'End':
          event.preventDefault()
          setFocusedMenuIndex(menuItemCount - 1)
          menuItemsRef.current[menuItemCount - 1]?.focus()
          break
        case 'Tab':
          // Close menu on tab out
          setShowMenu(false)
          setFocusedMenuIndex(-1)
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showMenu, getMenuItemCount])

  // Focus first menu item when menu opens
  useEffect(() => {
    if (showMenu) {
      setFocusedMenuIndex(0)
      // Small delay to ensure menu is rendered
      setTimeout(() => {
        menuItemsRef.current[0]?.focus()
      }, 50)
    }
  }, [showMenu])

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
    setShowDeleteConfirm(true)
    setShowMenu(false)
  }

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    const success = await deleteProject()
    if (success) {
      router.push('/projects')
    } else {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
      setErrorToast('Failed to delete project. Please try again.')
      setTimeout(() => setErrorToast(null), 5000)
    }
  }

  const handleCompleteMilestone = async (milestoneId: string) => {
    const result = await completeMilestone(milestoneId)
    return result
  }

  const handleUncompleteMilestone = async (milestoneId: string) => {
    const result = await uncompleteMilestone(milestoneId)
    return result
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
              ref={menuButtonRef}
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-full hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              aria-expanded={showMenu}
              aria-haspopup="menu"
              aria-label="Project options menu"
            >
              <MoreVertical className="w-5 h-5 text-slate-400" />
            </button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  ref={menuRef}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50"
                  role="menu"
                  aria-label="Project actions"
                  aria-orientation="vertical"
                >
                  {(() => {
                    let itemIndex = 0
                    return (
                      <>
                        <button
                          ref={el => { menuItemsRef.current[itemIndex] = el }}
                          onClick={() => {
                            setIsEditing(true)
                            setShowMenu(false)
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 focus:bg-slate-700 focus:outline-none flex items-center gap-2"
                          role="menuitem"
                          tabIndex={focusedMenuIndex === itemIndex++ ? 0 : -1}
                        >
                          <Pencil className="w-4 h-4" />
                          Edit Details
                        </button>

                        <Link
                          ref={el => { menuItemsRef.current[itemIndex] = el }}
                          href="/path-finder"
                          className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 focus:bg-slate-700 focus:outline-none flex items-center gap-2"
                          role="menuitem"
                          tabIndex={focusedMenuIndex === itemIndex++ ? 0 : -1}
                          onClick={() => setShowMenu(false)}
                        >
                          <Compass className="w-4 h-4" />
                          Rethink in Path Finder
                        </Link>

                        {status.next && (
                          <button
                            ref={el => { menuItemsRef.current[itemIndex] = el }}
                            onClick={() => handleStatusChange(status.next as Project['status'])}
                            className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 focus:bg-slate-700 focus:outline-none flex items-center gap-2"
                            role="menuitem"
                            tabIndex={focusedMenuIndex === itemIndex++ ? 0 : -1}
                          >
                            <Play className="w-4 h-4" />
                            Move to {statusConfig[status.next as keyof typeof statusConfig].label}
                          </button>
                        )}

                        {currentProject.status !== 'paused' && currentProject.status !== 'launched' && (
                          <button
                            ref={el => { menuItemsRef.current[itemIndex] = el }}
                            onClick={() => handleStatusChange('paused')}
                            className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 focus:bg-slate-700 focus:outline-none flex items-center gap-2"
                            role="menuitem"
                            tabIndex={focusedMenuIndex === itemIndex++ ? 0 : -1}
                          >
                            <PauseCircle className="w-4 h-4" />
                            Pause Project
                          </button>
                        )}

                        <button
                          ref={el => { menuItemsRef.current[itemIndex] = el }}
                          onClick={handleDelete}
                          className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 focus:bg-slate-700 focus:outline-none flex items-center gap-2"
                          role="menuitem"
                          tabIndex={focusedMenuIndex === itemIndex++ ? 0 : -1}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete Project
                        </button>
                      </>
                    )
                  })()}
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
                <Button onClick={handleSaveEdit} isLoading={isSaving} loadingText="Saving project changes...">
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
                  <Button size="sm" onClick={handleAddMilestone} isLoading={isAddingMilestone} loadingText="Adding milestone...">
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
                  <Button size="sm" onClick={handleAddIdea} isLoading={isAddingIdea} loadingText="Adding idea..." className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border-yellow-500/30">
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

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
              onClick={() => !isDeleting && setShowDeleteConfirm(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-sm w-full shadow-xl"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-full bg-red-500/20">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Delete project?</h3>
                </div>

                <p className="text-slate-400 text-sm mb-2">
                  This will permanently delete <span className="text-white font-medium">{currentProject.name}</span> and all its milestones and ideas.
                </p>
                <p className="text-red-400/80 text-xs">
                  This action cannot be undone.
                </p>

                <div className="flex gap-3 mt-5">
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/30"
                    onClick={handleConfirmDelete}
                    isLoading={isDeleting}
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
