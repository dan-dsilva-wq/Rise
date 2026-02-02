'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import {
  Settings, ChevronLeft, MessageSquare, Target, Hammer, Rocket,
  PauseCircle, MoreVertical, Pencil, Trash2, Play, CheckCircle
} from 'lucide-react'
import Link from 'next/link'
import { MilestoneList } from './MilestoneList'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { XpCounter } from '@/components/gamification/XpCounter'
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
    addMilestone,
    completeMilestone,
    deleteMilestone,
  } = useProject(initialProject?.id, user?.id)

  const [showMenu, setShowMenu] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(initialProject?.name || '')
  const [editDescription, setEditDescription] = useState(initialProject?.description || '')
  const [recentXpGain, setRecentXpGain] = useState(0)
  const [showAddMilestone, setShowAddMilestone] = useState(false)
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')

  const currentProfile = profile || initialProfile
  const currentProject = loading ? initialProject : project
  const currentMilestones = loading ? initialMilestones : milestones

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
    await updateProject({
      name: editName,
      description: editDescription,
    })
    setIsEditing(false)
  }

  const handleStatusChange = async (newStatus: Project['status']) => {
    await updateProject({ status: newStatus })
    setShowMenu(false)
  }

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this project?')) {
      // Delete via Supabase directly since we don't have a delete in useProject for single project
      router.push('/projects')
    }
  }

  const handleCompleteMilestone = async (milestoneId: string) => {
    const xp = await completeMilestone(milestoneId)
    if (xp > 0) {
      setRecentXpGain(xp)
      await refreshProfile()
      setTimeout(() => setRecentXpGain(0), 3000)
    }
    return xp
  }

  const handleAddMilestone = async () => {
    if (!newMilestoneTitle.trim()) return

    await addMilestone({
      title: newMilestoneTitle,
      description: '',
    })

    setNewMilestoneTitle('')
    setShowAddMilestone(false)
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
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-white font-bold"
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
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white min-h-[100px]"
                  placeholder="What are you building?"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit}>
                  Save Changes
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Progress Card */}
        <Card variant="elevated">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Progress</h3>
            <XpCounter
              totalXp={currentProfile?.total_xp || 0}
              level={currentProfile?.current_level || 1}
              recentGain={recentXpGain}
            />
          </div>

          {/* Progress Bar */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-slate-400">Overall</span>
              <span className="text-white font-medium">{currentProject.progress_percent}%</span>
            </div>
            <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${currentProject.progress_percent}%` }}
                transition={{ duration: 0.5 }}
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full"
              />
            </div>
          </div>
        </Card>

        {/* Description (when not editing) */}
        {!isEditing && currentProject.description && (
          <Card>
            <p className="text-slate-300">{currentProject.description}</p>
          </Card>
        )}

        {/* AI Builder Button */}
        <Link href={`/projects/${currentProject.id}/build`}>
          <Card className="bg-gradient-to-br from-teal-900/30 to-slate-800/50 border-teal-700/30 hover:border-teal-600/50 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-teal-500/10">
                <MessageSquare className="w-6 h-6 text-teal-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">AI Builder</h3>
                <p className="text-sm text-slate-400">Work with AI to build your project</p>
              </div>
            </div>
          </Card>
        </Link>

        {/* Milestones */}
        <Card>
          <MilestoneList
            milestones={currentMilestones}
            onComplete={handleCompleteMilestone}
            onAdd={() => setShowAddMilestone(true)}
            onDelete={deleteMilestone}
            showAddButton
            isEditable
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
                <input
                  type="text"
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  placeholder="Milestone title..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white mb-3"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowAddMilestone(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddMilestone}>
                    Add Milestone
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </main>
    </div>
  )
}
