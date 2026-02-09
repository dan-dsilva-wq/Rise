'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Loader2, User, Sparkles, UserCircle, Plus, X, Check, Edit2, Trash2, MessageSquare, Clock, FolderPlus, CheckCircle, Rocket, Copy, Download, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import { useProfileFacts } from '@/lib/hooks/useProfileFacts'
import { usePathFinderConversation } from '@/lib/hooks/usePathFinderConversation'
import { createClient } from '@/lib/supabase/client'
import { addDebugLog } from '@/components/ui/ConnectionStatus'
import { rebalanceMilestoneFocusPipeline } from '@/lib/milestones/focusPipeline'
import type { ProfileCategory, UserProfileFact } from '@/lib/supabase/types'
import { formatDistanceToNow } from 'date-fns'

interface ActionResult {
  type: 'create_project' | 'add_milestone' | 'add_idea' | 'add_note' | 'promote_idea' | 'set_focus' | 'update_status' | 'edit_milestone' | 'complete_milestone' | 'discard_milestone' | 'reorder' | 'update_steps'
  text: string // Human-readable text
  projectId?: string
  projectName?: string
  milestoneId?: string
  milestoneTitle?: string
  isIdea?: boolean
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  actionResults?: ActionResult[] // Structured action data for clickable cards
}

interface MilestoneWithSteps {
  title: string
  steps: string[]
}

interface ProjectAction {
  type: 'create' | 'add_milestone' | 'add_idea' | 'add_note' | 'promote_idea' | 'set_focus' | 'update_status' | 'edit_milestone' | 'complete_milestone' | 'discard_milestone' | 'reorder_milestones' | 'update_steps'
  projectId?: string
  milestoneId?: string
  name?: string
  description?: string
  milestones?: string[]
  milestonesWithSteps?: MilestoneWithSteps[] // Milestones with their steps for create
  newMilestone?: string
  newMilestoneSteps?: string[] // Steps for add_milestone
  newIdea?: string
  newNote?: string
  newTitle?: string
  newStatus?: 'discovery' | 'planning' | 'building' | 'launched' | 'paused'
  focusLevel?: 'active' | 'next' | 'backlog'
  milestoneOrder?: string[] // Array of milestone IDs in new order
  newSteps?: string[] // Steps for update_steps
}

interface ExistingProject {
  id: string
  name: string
  description: string | null
  status: string
  milestones: { id: string; title: string; status: string; sort_order: number; notes: string | null; focus_level: string; completed_at: string | null; completedSteps: number; totalSteps: number }[]
  ideas: { id: string; title: string; notes: string | null }[]
}

type ProjectListItem = Pick<ExistingProject, 'id' | 'name' | 'description' | 'status'>
type MilestoneItem = { id: string; title: string; status: string; sort_order: number; notes: string | null; focus_level: string; completed_at: string | null }

interface PathFinderChatProps {
  userId: string
  initialConversation?: PathFinderConversation | null
  initialConversations?: PathFinderConversation[]
  initialMessages?: PathFinderMessage[]
  initialFacts?: UserProfileFact[]
}

// Import the types we need for initial data
import type { PathFinderConversation, PathFinderMessage } from '@/lib/supabase/types'

const CATEGORY_LABELS: Record<ProfileCategory, string> = {
  background: 'Background',
  skills: 'Skills',
  situation: 'Situation',
  goals: 'Goals',
  preferences: 'Preferences',
  constraints: 'Constraints',
}

const CATEGORY_COLORS: Record<ProfileCategory, string> = {
  background: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  skills: 'bg-green-500/20 text-green-400 border-green-500/30',
  situation: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  goals: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  preferences: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  constraints: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const INITIAL_MESSAGES = {
  withProfile: `Welcome back! I've got your profile info ready - I know a bit about your background, skills, and what you're working toward.

Let's pick up where we left off. **What's on your mind today?** Any new developments, or want to explore a specific direction?`,
  noProfile: `Hey! I'm here to help you figure out what to build.

This isn't a quiz where I give you a generic answer at the end. We're going to have a real conversation to find something that actually fits YOUR situation.

As we talk, I'll remember important things you share so we can build on our conversations over time.

Let's start simple: **What does "freedom" mean to you?** Is it about money, time, location, the type of work you do, or something else entirely?`,
  freshStart: `Fresh start! I still have your profile saved, so I know your background. **What would you like to explore today?**`,
}

// Helper to parse action results embedded in message content
const ACTION_RESULTS_PATTERN = /\n\n<!-- ACTION_RESULTS:(.*?) -->/
function parseMessageWithActions(content: string): { content: string; actionResults?: ActionResult[] } {
  const match = content.match(ACTION_RESULTS_PATTERN)
  if (match) {
    try {
      const actionResults = JSON.parse(match[1]) as ActionResult[]
      const cleanContent = content.replace(ACTION_RESULTS_PATTERN, '')
      return { content: cleanContent, actionResults }
    } catch {
      // Failed to parse, just return content as-is
      return { content }
    }
  }
  return { content }
}

// Helper to transform database messages to Message format with action results
function transformMessage(m: { id: string; role: 'user' | 'assistant'; content: string }): Message {
  const { content, actionResults } = parseMessageWithActions(m.content)
  return {
    id: m.id,
    role: m.role,
    content,
    actionResults,
  }
}

export function PathFinderChat({ userId, initialConversation, initialConversations, initialMessages, initialFacts }: PathFinderChatProps) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any

  // Check if we have server-fetched initial data (avoids waiting for hooks)
  const hasInitialData = !!(initialConversation && initialMessages && initialMessages.length > 0)

  const { facts: hookFacts, loading: factsLoading, addFact, updateFact, removeFact, getProfileSummary } = useProfileFacts(userId)

  // Use initialFacts as fallback while hook is loading
  const facts = (hookFacts.length > 0) ? hookFacts : (initialFacts || [])
  const {
    conversations: hookConversations,
    currentConversation,
    loading: convoLoading,
    loadConversation,
    loadMostRecent,
    createConversation,
    addMessage: saveMessage,
    updateTitle,
    archiveConversation,
    startNew,
    setCurrentDirect,
  } = usePathFinderConversation(userId)

  // Use initialConversations as fallback while hook is loading
  const conversations = (hookConversations.length > 0) ? hookConversations : (initialConversations || [])

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [addingFact, setAddingFact] = useState<ProfileCategory | null>(null)
  const [newFactText, setNewFactText] = useState('')
  const [editingFact, setEditingFact] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [existingProjects, setExistingProjects] = useState<ExistingProject[]>([])
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Fetch existing projects
  const fetchProjects = useCallback(async (): Promise<ExistingProject[] | null> => {
    if (!userId) {
      setExistingProjects([])
      return []
    }

    try {
      const { data: projects, error: projectsError } = await client
        .from('projects')
        .select('id, name, description, status')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (projectsError) {
        addDebugLog('error', 'fetchProjects failed', projectsError.message)
        return null
      }

      const projectRows = (projects || []) as ProjectListItem[]
      const projectsWithMilestones = await Promise.all(projectRows.map(async (project) => {
        const { data: allItems, error: milestonesError } = await client
          .from('milestones')
          .select('id, title, status, sort_order, notes, focus_level, completed_at')
          .eq('project_id', project.id)
          .neq('status', 'discarded') // Don't show discarded
          .order('sort_order', { ascending: true })

        if (milestonesError) {
          addDebugLog('warn', 'fetchProjects milestones failed', `${project.id.slice(0, 8)}: ${milestonesError.message}`)
        }

        // Separate active milestones from ideas
        const milestoneRows = (allItems || []) as MilestoneItem[]
        const milestones = milestoneRows.filter(m => m.status !== 'idea')
        const ideas = milestoneRows.filter(m => m.status === 'idea')

        // Batch-fetch step counts for all milestones in this project
        const milestoneIds = milestones.map(m => m.id)
        let stepCountMap: Record<string, { total: number; completed: number }> = {}
        if (milestoneIds.length > 0) {
          const { data: stepsData } = await client
            .from('milestone_steps')
            .select('milestone_id, completed_at')
            .in('milestone_id', milestoneIds)

          if (stepsData) {
            for (const step of stepsData) {
              const entry = stepCountMap[step.milestone_id] || { total: 0, completed: 0 }
              entry.total++
              if (step.completed_at) entry.completed++
              stepCountMap[step.milestone_id] = entry
            }
          }
        }

        return {
          ...project,
          milestones: milestones.map(m => ({
            ...m,
            completedSteps: stepCountMap[m.id]?.completed ?? 0,
            totalSteps: stepCountMap[m.id]?.total ?? 0,
          })),
          ideas,
        }
      }))

      setExistingProjects(projectsWithMilestones)
      return projectsWithMilestones
    } catch (error) {
      addDebugLog('error', 'fetchProjects exception', String(error))
      return null
    }
  }, [userId, client])

  // Execute project actions from AI
  const executeProjectActions = async (actions: ProjectAction[]): Promise<ActionResult[]> => {
    if (!userId) {
      addDebugLog('error', 'No userId for actions')
      return []
    }
    const results: ActionResult[] = []
    const projectLookupCache = new Map<string, { id: string; name: string } | null>()
    const normalizeUuid = (value?: string) => value?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]

    const resolveProject = async (projectId: string) => {
      if (projectLookupCache.has(projectId)) {
        return projectLookupCache.get(projectId) ?? null
      }

      const { data, error } = await client
        .from('projects')
        .select('id, name')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw error

      const resolved = data ? { id: data.id as string, name: data.name as string } : null
      projectLookupCache.set(projectId, resolved)
      return resolved
    }

    addDebugLog('info', 'executeProjectActions', JSON.stringify(actions).slice(0, 200))

    for (const action of actions) {
      try {
        addDebugLog('info', `Executing ${action.type}`, action.projectId || action.name || '')
        if (action.type === 'create' && action.name) {
          // Create project
          const { data: projectData, error: projectError } = await client
            .from('projects')
            .insert({
              user_id: userId,
              name: action.name,
              description: action.description || '',
              status: 'discovery',
            })
            .select()
            .single()

          if (projectError) throw projectError

          // Create milestones with smart focus defaults
          // First milestone = active, next 2 = next, rest = backlog
          if (action.milestones && action.milestones.length > 0) {
            const milestonesData = action.milestones.map((title, index) => ({
              project_id: projectData.id,
              user_id: userId,
              title,
              sort_order: index,
              status: 'pending',
              xp_reward: 50,
              focus_level: index === 0 ? 'active' : index <= 2 ? 'next' : 'backlog',
            }))
            const { data: createdMilestones, error: milestonesError } = await client
              .from('milestones')
              .insert(milestonesData)
              .select('id, title')
            if (milestonesError) throw milestonesError

            // Save steps for each milestone if provided
            if (action.milestonesWithSteps && createdMilestones) {
              for (const createdMilestone of createdMilestones) {
                const milestoneWithSteps = action.milestonesWithSteps.find(
                  m => m.title === createdMilestone.title
                )
                if (milestoneWithSteps && milestoneWithSteps.steps.length > 0) {
                  const stepsData = milestoneWithSteps.steps.map((text, stepIndex) => ({
                    milestone_id: createdMilestone.id,
                    user_id: userId,
                    text,
                    step_type: 'action',
                    sort_order: stepIndex,
                  }))
                  const { error: stepsError } = await client.from('milestone_steps').insert(stepsData)
                  if (stepsError) {
                    console.warn('Failed to save steps for milestone:', createdMilestone.title, stepsError)
                  }
                }
              }
            }
          }

          results.push({
            type: 'create_project',
            text: `Created project: ${action.name}`,
            projectId: projectData.id,
            projectName: action.name,
          })
        } else if (action.type === 'add_milestone' && action.projectId && action.newMilestone) {
          const normalizedProjectId = normalizeUuid(action.projectId)
          if (!normalizedProjectId) {
            results.push({ type: 'add_milestone', text: 'Failed: Invalid project id format' })
            continue
          }
          const project = await resolveProject(normalizedProjectId)
          if (!project) {
            results.push({ type: 'add_milestone', text: 'Failed: Project not found (it may have been deleted)' })
            continue
          }

          // Get current milestone count for sort order (exclude ideas)
          const { data: existing, error: existingError } = await client
            .from('milestones')
            .select('id, focus_level')
            .eq('project_id', normalizedProjectId)
            .eq('user_id', userId)
            .neq('status', 'idea')
            .neq('status', 'completed')
            .neq('status', 'discarded')

          if (existingError) throw existingError

          // Smart default: if no active, make this active; if < 3 next, make next; else backlog
          type MilestoneWithFocus = { id: string; focus_level: string }
          const hasActive = existing?.some((m: MilestoneWithFocus) => m.focus_level === 'active')
          const nextCount = existing?.filter((m: MilestoneWithFocus) => m.focus_level === 'next').length || 0
          const defaultFocus = !hasActive ? 'active' : nextCount < 3 ? 'next' : 'backlog'

          const { data: milestoneData, error: milestoneError } = await client.from('milestones').insert({
            project_id: normalizedProjectId,
            user_id: userId,
            title: action.newMilestone,
            sort_order: existing?.length || 0,
            status: 'pending',
            xp_reward: 50,
            focus_level: defaultFocus,
          }).select().single()

          if (milestoneError) throw milestoneError

          // Save steps if provided
          if (action.newMilestoneSteps && action.newMilestoneSteps.length > 0 && milestoneData?.id) {
            const stepsData = action.newMilestoneSteps.map((text, stepIndex) => ({
              milestone_id: milestoneData.id,
              user_id: userId,
              text,
              step_type: 'action',
              sort_order: stepIndex,
            }))
            const { error: stepsError } = await client.from('milestone_steps').insert(stepsData)
            if (stepsError) {
              console.warn('Failed to save steps for milestone:', action.newMilestone, stepsError)
            }
          }

          const focusLabel = defaultFocus === 'active' ? ' (set as Active)' : defaultFocus === 'next' ? ' (added to Up Next)' : ''
          results.push({
            type: 'add_milestone',
            text: `Added milestone: ${action.newMilestone}${focusLabel}`,
            projectId: normalizedProjectId,
            projectName: project.name,
            milestoneId: milestoneData?.id,
            milestoneTitle: action.newMilestone,
          })
        } else if (action.type === 'add_idea' && action.projectId && action.newIdea) {
          const normalizedProjectId = normalizeUuid(action.projectId)
          if (!normalizedProjectId) {
            results.push({ type: 'add_idea', text: 'Failed: Invalid project id format' })
            continue
          }
          const project = await resolveProject(normalizedProjectId)
          if (!project) {
            results.push({ type: 'add_idea', text: 'Failed: Project not found (it may have been deleted)' })
            continue
          }

          // Add as idea (status = 'idea')
          const { data: existing, error: existingError } = await client
            .from('milestones')
            .select('id')
            .eq('project_id', normalizedProjectId)
            .eq('user_id', userId)

          if (existingError) throw existingError

          const { data: ideaData, error: ideaError } = await client.from('milestones').insert({
            project_id: normalizedProjectId,
            user_id: userId,
            title: action.newIdea,
            sort_order: existing?.length || 0,
            status: 'idea',
            xp_reward: 50,
          }).select().single()

          if (ideaError) throw ideaError

          results.push({
            type: 'add_idea',
            text: `Added idea: ${action.newIdea}`,
            projectId: normalizedProjectId,
            projectName: project.name,
            milestoneId: ideaData?.id,
            milestoneTitle: action.newIdea,
            isIdea: true,
          })
        } else if (action.type === 'add_note' && action.milestoneId && action.newNote) {
          // Add note to existing milestone/idea
          const { data: milestone, error: findError } = await client
            .from('milestones')
            .select('id, title, notes, project_id, status')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !milestone) {
            results.push({ type: 'add_note', text: 'Failed: Milestone not found' })
            continue
          }

          // Append to existing notes or create new
          const updatedNotes = milestone.notes
            ? `${milestone.notes}\n• ${action.newNote}`
            : `• ${action.newNote}`

          const { error: updateError } = await client
            .from('milestones')
            .update({ notes: updatedNotes, updated_at: new Date().toISOString() })
            .eq('id', action.milestoneId)

          if (updateError) {
            results.push({ type: 'add_note', text: `Failed to add note: ${updateError.message}` })
          } else {
            results.push({
              type: 'add_note',
              text: `Added note to: ${milestone.title}`,
              projectId: milestone.project_id,
              milestoneId: milestone.id,
              milestoneTitle: milestone.title,
              isIdea: milestone.status === 'idea',
            })
          }
        } else if (action.type === 'promote_idea' && action.milestoneId) {
          // Promote idea to active milestone
          const { data: idea, error: findError } = await client
            .from('milestones')
            .select('id, title, status, project_id')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !idea) {
            results.push({ type: 'promote_idea', text: 'Failed: Idea not found' })
            continue
          }

          if (idea.status !== 'idea') {
            results.push({ type: 'promote_idea', text: `Already a milestone: ${idea.title}` })
            continue
          }

          const { error: updateError } = await client
            .from('milestones')
            .update({ status: 'pending', updated_at: new Date().toISOString() })
            .eq('id', action.milestoneId)

          if (updateError) {
            results.push({ type: 'promote_idea', text: `Failed to promote: ${updateError.message}` })
          } else {
            results.push({
              type: 'promote_idea',
              text: `Promoted to milestone: ${idea.title}`,
              projectId: idea.project_id,
              milestoneId: idea.id,
              milestoneTitle: idea.title,
            })
          }
        } else if (action.type === 'set_focus' && action.milestoneId && action.focusLevel) {
          // Set focus level for milestone
          addDebugLog('info', 'Set focus', `id=${action.milestoneId.slice(0, 8)} level=${action.focusLevel}`)

          const { data: milestone, error: findError } = await client
            .from('milestones')
            .select('id, title, project_id, focus_level, status')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !milestone) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push({ type: 'set_focus', text: 'Failed: Milestone not found' })
            continue
          }

          // If setting to 'active', first clear any existing active milestone in this project
          if (action.focusLevel === 'active') {
            await client
              .from('milestones')
              .update({ focus_level: 'backlog' })
              .eq('project_id', milestone.project_id)
              .eq('focus_level', 'active')
          }

          // If setting to 'next', check we don't exceed 3
          if (action.focusLevel === 'next') {
            const { data: existingNext } = await client
              .from('milestones')
              .select('id')
              .eq('project_id', milestone.project_id)
              .eq('focus_level', 'next')
              .neq('status', 'completed')
              .neq('status', 'discarded')

            const isAlreadyNext = milestone.focus_level === 'next'
            if ((existingNext?.length || 0) >= 3 && !isAlreadyNext) {
              addDebugLog('warn', 'Max 3 in Up Next', `project=${milestone.project_id.slice(0, 8)}`)
              results.push({ type: 'set_focus', text: 'Cannot add to Up Next: max 3 items allowed' })
              continue
            }
          }

          const { error: updateError } = await client
            .from('milestones')
            .update({ focus_level: action.focusLevel, updated_at: new Date().toISOString() })
            .eq('id', action.milestoneId)

          if (updateError) {
            addDebugLog('error', 'Set focus failed', updateError.message)
            results.push({ type: 'set_focus', text: `Failed to set focus: ${updateError.message}` })
          } else {
            const levelLabel = action.focusLevel === 'active' ? 'Active' : action.focusLevel === 'next' ? 'Up Next' : 'Backlog'
            addDebugLog('success', 'Focus set', `${milestone.title} -> ${levelLabel}`)
            results.push({
              type: 'set_focus',
              text: `Set "${milestone.title}" to ${levelLabel}`,
              projectId: milestone.project_id,
              milestoneId: milestone.id,
              milestoneTitle: milestone.title,
              isIdea: milestone.status === 'idea',
            })
          }
        } else if (action.type === 'update_status' && action.projectId && action.newStatus) {
          const normalizedProjectId = normalizeUuid(action.projectId)
          if (!normalizedProjectId) {
            results.push({ type: 'update_status', text: 'Failed: Invalid project id format' })
            continue
          }
          const project = await resolveProject(normalizedProjectId)
          if (!project) {
            results.push({ type: 'update_status', text: 'Failed: Project not found (it may have been deleted)' })
            continue
          }

          const { data: updatedProject, error: updateStatusError } = await client
            .from('projects')
            .update({ status: action.newStatus })
            .eq('id', normalizedProjectId)
            .eq('user_id', userId)
            .select('id')
            .maybeSingle()

          if (updateStatusError) {
            results.push({ type: 'update_status', text: `Failed to update status: ${updateStatusError.message}` })
            continue
          }
          if (!updatedProject) {
            results.push({ type: 'update_status', text: 'Failed: Project not found' })
            continue
          }

          results.push({
            type: 'update_status',
            text: `Updated ${project.name} to ${action.newStatus}`,
            projectId: normalizedProjectId,
            projectName: project.name,
          })
        } else if (action.type === 'edit_milestone' && action.milestoneId && action.newTitle) {
          // Edit milestone title
          addDebugLog('info', 'Edit milestone', `id=${action.milestoneId.slice(0, 8)} title=${action.newTitle}`)

          // First check if milestone exists
          const { data: existing, error: findError } = await client
            .from('milestones')
            .select('id, title, project_id, status')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !existing) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push({ type: 'edit_milestone', text: 'Failed: Milestone not found' })
            continue
          }

          const { error: updateError } = await client
            .from('milestones')
            .update({ title: action.newTitle, updated_at: new Date().toISOString() })
            .eq('id', action.milestoneId)

          if (updateError) {
            addDebugLog('error', 'Edit failed', updateError.message)
            results.push({ type: 'edit_milestone', text: `Failed to edit: ${updateError.message}` })
          } else {
            addDebugLog('success', 'Milestone edited', action.newTitle)
            results.push({
              type: 'edit_milestone',
              text: `Updated milestone: ${action.newTitle}`,
              projectId: existing.project_id,
              milestoneId: existing.id,
              milestoneTitle: action.newTitle,
              isIdea: existing.status === 'idea',
            })
          }
        } else if (action.type === 'complete_milestone' && action.milestoneId) {
          // Mark milestone as complete
          addDebugLog('info', 'Complete milestone', `id=${action.milestoneId.slice(0, 8)}`)

          const { data: milestone, error: findError } = await client
            .from('milestones')
            .select('id, title, xp_reward, status, project_id')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !milestone) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push({ type: 'complete_milestone', text: 'Failed: Milestone not found' })
            continue
          }

          addDebugLog('info', 'Found milestone', `title=${milestone.title} status=${milestone.status}`)

          const { error: updateError } = await client
            .from('milestones')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', action.milestoneId)

          if (updateError) {
            addDebugLog('error', 'Complete failed', updateError.message)
            results.push({ type: 'complete_milestone', text: `Failed to complete: ${updateError.message}` })
          } else {
            await rebalanceMilestoneFocusPipeline(client, milestone.project_id)

            // Award XP
            if (milestone.xp_reward) {
              await client.rpc('increment_xp', {
                user_id: userId,
                xp_amount: milestone.xp_reward,
              })
            }
            addDebugLog('success', 'Milestone completed', `${milestone.title} +${milestone.xp_reward || 50}XP`)
            results.push({
              type: 'complete_milestone',
              text: `Completed: ${milestone.title} (+${milestone.xp_reward || 50} XP)`,
              projectId: milestone.project_id,
              milestoneId: milestone.id,
              milestoneTitle: milestone.title,
            })
          }
        } else if (action.type === 'discard_milestone' && action.milestoneId) {
          // Discard milestone (soft delete - keeps data)
          addDebugLog('info', 'Discard milestone', `id=${action.milestoneId.slice(0, 8)}`)

          const { data: milestone, error: findError } = await client
            .from('milestones')
            .select('id, title, status, project_id')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !milestone) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push({ type: 'discard_milestone', text: 'Failed: Milestone not found' })
            continue
          }

          addDebugLog('info', 'Found milestone', `title=${milestone.title} status=${milestone.status}`)

          const { error: updateError } = await client
            .from('milestones')
            .update({
              status: 'discarded',
              updated_at: new Date().toISOString(),
            })
            .eq('id', action.milestoneId)

          if (updateError) {
            addDebugLog('error', 'Discard failed', updateError.message)
            results.push({ type: 'discard_milestone', text: `Failed to discard: ${updateError.message}` })
          } else {
            addDebugLog('success', 'Milestone discarded', milestone.title)
            results.push({
              type: 'discard_milestone',
              text: `Discarded: ${milestone.title}`,
              projectId: milestone.project_id,
              milestoneId: milestone.id,
              milestoneTitle: milestone.title,
            })
          }
        } else if (action.type === 'reorder_milestones' && action.projectId && action.milestoneOrder) {
          // Reorder milestones
          const normalizedProjectId = normalizeUuid(action.projectId)
          if (!normalizedProjectId) {
            results.push({ type: 'reorder', text: 'Failed: Invalid project id format' })
            continue
          }
          addDebugLog('info', 'Reorder milestones', `project=${normalizedProjectId.slice(0, 8)} order=${action.milestoneOrder.length} items`)

          const project = await resolveProject(normalizedProjectId)
          if (!project) {
            addDebugLog('error', 'Project not found', action.projectId)
            results.push({ type: 'reorder', text: 'Failed: Project not found' })
            continue
          }

          // Update each milestone's sort_order
          let success = true
          for (let i = 0; i < action.milestoneOrder.length; i++) {
            const milestoneId = action.milestoneOrder[i]
            const { data: updatedMilestone, error } = await client
              .from('milestones')
              .update({ sort_order: i, updated_at: new Date().toISOString() })
              .eq('id', milestoneId)
              .eq('project_id', normalizedProjectId)
              .eq('user_id', userId)
              .select('id')
              .maybeSingle()

            if (error || !updatedMilestone) {
              const errorMsg = error?.message || 'milestone not found in project'
              addDebugLog('error', 'Reorder failed', `milestone ${milestoneId.slice(0, 8)}: ${errorMsg}`)
              success = false
              break
            }
          }

          if (success) {
            addDebugLog('success', 'Milestones reordered', `${action.milestoneOrder.length} milestones`)
            results.push({
              type: 'reorder',
              text: `Reordered milestones in ${project.name}`,
              projectId: normalizedProjectId,
              projectName: project.name,
            })
          } else {
            results.push({ type: 'reorder', text: 'Failed to reorder milestones' })
          }
        } else if (action.type === 'update_steps' && action.milestoneId && action.newSteps && action.newSteps.length > 0) {
          // Update steps for existing milestone
          addDebugLog('info', 'Update steps', `id=${action.milestoneId.slice(0, 8)} steps=${action.newSteps.length}`)

          const { data: milestone, error: findError } = await client
            .from('milestones')
            .select('id, title, project_id')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !milestone) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push({ type: 'edit_milestone', text: 'Failed: Milestone not found' })
            continue
          }

          // Delete existing steps for this milestone
          const { error: deleteError } = await client
            .from('milestone_steps')
            .delete()
            .eq('milestone_id', action.milestoneId)
            .eq('user_id', userId)

          if (deleteError) {
            addDebugLog('warn', 'Failed to delete old steps', deleteError.message)
          }

          // Insert new steps
          const stepsData = action.newSteps.map((text, stepIndex) => ({
            milestone_id: action.milestoneId!,
            user_id: userId,
            text,
            step_type: 'action',
            sort_order: stepIndex,
          }))

          const { error: insertError } = await client.from('milestone_steps').insert(stepsData)

          if (insertError) {
            addDebugLog('error', 'Failed to insert steps', insertError.message)
            results.push({ type: 'edit_milestone', text: `Failed to update steps: ${insertError.message}` })
          } else {
            addDebugLog('success', 'Steps updated', `${action.newSteps.length} steps for ${milestone.title}`)
            results.push({
              type: 'edit_milestone',
              text: `Updated steps for: ${milestone.title}`,
              projectId: milestone.project_id,
              milestoneId: milestone.id,
              milestoneTitle: milestone.title,
            })
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        addDebugLog('error', `Action ${action.type} failed`, errMsg)
        console.error('Failed to execute project action:', err)
        results.push({ type: action.type as ActionResult['type'], text: `Failed: ${action.type} - ${errMsg}` })
      }
    }

    // Refresh projects list
    await fetchProjects()
    addDebugLog('success', 'Actions complete', `${results.length} results`)
    return results
  }

  // Initialize: use server-provided data if available, otherwise load from hooks
  useEffect(() => {
    addDebugLog('info', 'PathFinder init', `userId=${!!userId} hasData=${hasInitialData} init=${initialized}`)

    // Don't run if already initialized or no userId
    if (initialized || !userId) {
      return
    }

    // If we have server-fetched initial data, use it immediately!
    // This is the key fix for client-side navigation
    if (hasInitialData && initialMessages && initialConversation) {
      addDebugLog('success', 'Using server data', `${initialMessages.length} messages`)
      setMessages(initialMessages.map(transformMessage))
      setInitialized(true)
      fetchProjects()
      // Set the conversation directly (synchronous) so addMessage works immediately
      setCurrentDirect(initialConversation, initialMessages)
      return
    }

    // No server data - wait for hooks to finish loading, but with a timeout
    const timeoutId = setTimeout(() => {
      if (!initialized) {
        addDebugLog('warn', 'Init timeout', 'Forcing empty state after 5s')
        setInitialized(true)
        setSaveError('Connection timeout - messages may not save')
        // Use initialFacts to determine if user has profile, even if conversation didn't load
        const hasProfile = (initialFacts && initialFacts.length > 0) || facts.length > 0
        setMessages([{
          id: 'initial',
          role: 'assistant',
          content: hasProfile ? INITIAL_MESSAGES.withProfile : INITIAL_MESSAGES.noProfile,
        }])
      }
    }, 5000) // 5 second timeout

    if (factsLoading || convoLoading) {
      addDebugLog('info', 'Waiting for hooks', `facts=${factsLoading} convo=${convoLoading}`)
      return () => clearTimeout(timeoutId)
    }

    const init = async () => {
      addDebugLog('info', 'init() starting')
      clearTimeout(timeoutId)

      // Fetch existing projects in parallel
      fetchProjects()

      try {
        const recent = await loadMostRecent()
        addDebugLog('info', 'loadMostRecent', `found=${!!recent} msgs=${recent?.messages?.length || 0}`)

        if (recent && recent.messages.length > 0) {
          addDebugLog('success', 'Loaded conversation', `${recent.messages.length} messages`)
          // Load existing conversation with messages
          setMessages(recent.messages.map(transformMessage))
        } else {
          addDebugLog('info', 'Creating new conversation')
          // Start new conversation (or resume empty one)
          const convo = recent || await createConversation()

          if (!convo) {
            addDebugLog('error', 'Failed to create conversation', 'No conversation returned')
            setSaveError('Failed to connect - messages will not save')
          } else {
            addDebugLog('success', 'Conversation created', convo.id.slice(0, 8))
          }

          const hasProfile = (initialFacts && initialFacts.length > 0) || facts.length > 0
          const initialContent = hasProfile ? INITIAL_MESSAGES.withProfile : INITIAL_MESSAGES.noProfile

          // Save the initial message to the database
          if (convo) {
            try {
              await saveMessage('assistant', initialContent)
              addDebugLog('success', 'Initial message saved')
            } catch (err) {
              addDebugLog('error', 'Failed to save initial msg', String(err))
            }
          }

          const initialMessage: Message = {
            id: 'initial',
            role: 'assistant',
            content: initialContent,
          }
          setMessages([initialMessage])
        }
      } catch (err) {
        addDebugLog('error', 'init() failed', String(err))
        setSaveError('Connection error - messages may not save')
        // Show default message on error
        const hasProfile = (initialFacts && initialFacts.length > 0) || facts.length > 0
        setMessages([{
          id: 'initial',
          role: 'assistant',
          content: hasProfile ? INITIAL_MESSAGES.withProfile : INITIAL_MESSAGES.noProfile,
        }])
      }
      addDebugLog('success', 'init() complete')
      setInitialized(true)
    }
    init()

    return () => clearTimeout(timeoutId)
  }, [factsLoading, convoLoading, initialized, userId, loadMostRecent, setCurrentDirect, createConversation, saveMessage, facts.length, fetchProjects, hasInitialData, initialMessages, initialFacts, initialConversation])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    if (!input.trim() || isLoading) return

    addDebugLog('info', 'Sending message', input.trim().slice(0, 50))

    let canSaveToCloud = !!currentConversation

    // Try to recover if conversation isn't ready yet
    if (!canSaveToCloud) {
      addDebugLog('warn', 'No active conversation', 'Trying to create one now')
      const recoveredConversation = await createConversation()
      canSaveToCloud = !!recoveredConversation
      if (canSaveToCloud) {
        addDebugLog('success', 'Cloud session recovered')
        setSaveError(null)
      }
    }

    if (!canSaveToCloud) {
      addDebugLog('error', 'No conversation', 'Messages will not be saved')
      setSaveError('No cloud connection - messages will not be saved')
      setTimeout(() => setSaveError(null), 5000)
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Save user message to database (if we have a conversation)
    if (canSaveToCloud) {
      try {
        const saved = await saveMessage('user', userMessage.content)
        if (!saved) {
          addDebugLog('error', 'User msg not saved')
          setSaveError('Message not saved - check connection')
          setTimeout(() => setSaveError(null), 5000)
        } else {
          addDebugLog('success', 'User msg saved')
        }
      } catch (err) {
        addDebugLog('error', 'Failed to save user msg', String(err))
        setSaveError('Failed to save message')
        setTimeout(() => setSaveError(null), 5000)
      }
    }

    try {
      addDebugLog('info', 'Calling AI API')
      const profileSummary = getProfileSummary()
      const latestProjects = await fetchProjects()
      const projectsForContext = latestProjects ?? existingProjects
      const response = await fetch('/api/path-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          profileContext: profileSummary || undefined,
          existingProjects: projectsForContext.length > 0 ? projectsForContext : undefined,
        }),
      })

      if (!response.ok) {
        addDebugLog('error', 'AI API error', `Status: ${response.status}`)
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      addDebugLog('success', 'AI response received')

      // Execute any project actions from the AI
      let actionResults: ActionResult[] = []
      if (data.projectActions && data.projectActions.length > 0) {
        addDebugLog('info', 'Executing project actions', `${data.projectActions.length} actions`)
        actionResults = await executeProjectActions(data.projectActions)
        if (actionResults.length > 0) {
          setActionFeedback(actionResults.map(r => r.text).join(' | '))
          setTimeout(() => setActionFeedback(null), 5000)
        }
      }

      // Detect if AI claimed to do something but didn't include tags
      const claimsAction = /(?:done|i've added|i've created|i added|i created|added (?:the |a )?milestone|created (?:the |a )?project|updated (?:the |your )?milestone|marked.*complete|set.*milestone)/i.test(data.message)
      const noActionsPerformed = !data.projectActions || data.projectActions.length === 0

      if (claimsAction && noActionsPerformed) {
        addDebugLog('warn', 'AI claimed action but no tags', data.message.slice(0, 100))
        // Append a note to the message
        data.message += '\n\n⚠️ *It looks like I said I did something but forgot to actually do it. Please ask me again and I\'ll make sure to include the proper action this time.*'
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        actionResults: actionResults.length > 0 ? actionResults : undefined,
      }

      setMessages(prev => [...prev, assistantMessage])

      // Save assistant message to database (if we have a conversation)
      // Embed action results in content so they persist
      if (canSaveToCloud) {
        try {
          let contentToSave = assistantMessage.content
          if (actionResults.length > 0) {
            // Embed action results as hidden JSON at end of content
            contentToSave += `\n\n<!-- ACTION_RESULTS:${JSON.stringify(actionResults)} -->`
          }
          const saved = await saveMessage('assistant', contentToSave)
          if (!saved) {
            addDebugLog('error', 'AI msg not saved')
            setSaveError('Response not saved to cloud')
            setTimeout(() => setSaveError(null), 5000)
          } else {
            addDebugLog('success', 'AI msg saved')
          }
        } catch (err) {
          addDebugLog('error', 'Failed to save AI msg', String(err))
          setSaveError('Failed to save response')
          setTimeout(() => setSaveError(null), 5000)
        }
      }

      // Handle suggested facts from the AI
      if (data.suggestedFacts && data.suggestedFacts.length > 0) {
        addDebugLog('info', 'Saving profile facts', `${data.suggestedFacts.length} facts`)
        for (const suggested of data.suggestedFacts) {
          try {
            addDebugLog('info', `Saving fact: ${suggested.category}`, suggested.fact.slice(0, 50))
            await addFact(suggested.category as ProfileCategory, suggested.fact)
            addDebugLog('success', 'Fact saved', suggested.category)
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            addDebugLog('error', 'Failed to save fact', errMsg)
            console.error('Failed to save suggested fact:', err)
            setSaveError('Profile fact not saved')
            setTimeout(() => setSaveError(null), 5000)
          }
        }
      } else {
        addDebugLog('info', 'No profile facts in response')
      }

      // Auto-title the conversation if untitled (after first exchange)
      if (currentConversation && !currentConversation.title && messages.length <= 2) {
        // Generate title from user's first message
        const userFirstMsg = messages.find(m => m.role === 'user')?.content || input
        if (userFirstMsg) {
          // Take first ~40 chars, truncate at word boundary
          let title = userFirstMsg.slice(0, 50)
          if (userFirstMsg.length > 50) {
            const lastSpace = title.lastIndexOf(' ')
            if (lastSpace > 20) title = title.slice(0, lastSpace)
            title += '...'
          }
          // Clean up - remove newlines
          title = title.replace(/\n/g, ' ').trim()
          if (title) {
            addDebugLog('info', 'Auto-titling conversation', title)
            updateTitle(title)
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      addDebugLog('error', 'Chat API failed', errorMsg)
      console.error('Chat error:', error)
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, I had trouble connecting. Error: ${errorMsg}\n\nTap the green/red indicator in the top right to see debug info.`,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleNewChat = async () => {
    const convo = await startNew()
    const hasProfile = facts.length > 0
    const initialContent = hasProfile ? INITIAL_MESSAGES.freshStart : INITIAL_MESSAGES.noProfile

    // Save initial message to database
    if (convo) {
      try {
        await saveMessage('assistant', initialContent)
      } catch (err) {
        console.warn('Failed to save initial message:', err)
      }
    }

    const initialMessage: Message = {
      id: 'initial',
      role: 'assistant',
      content: initialContent,
    }
    setMessages([initialMessage])
    setShowHistory(false)
  }

  const handleLoadConversation = async (conversationId: string) => {
    const convo = await loadConversation(conversationId)
    if (convo) {
      setMessages(convo.messages.map(transformMessage))
    }
    setShowHistory(false)
  }

  const handleArchiveConversation = async (conversationId: string) => {
    await archiveConversation(conversationId)
    if (currentConversation?.id === conversationId) {
      await handleNewChat()
    }
  }

  const handleAddFact = async () => {
    if (!addingFact || !newFactText.trim()) return
    try {
      await addFact(addingFact, newFactText.trim())
      setNewFactText('')
      setAddingFact(null)
    } catch (err) {
      console.error('Failed to add fact:', err)
    }
  }

  const handleUpdateFact = async (factId: string) => {
    if (!editText.trim()) return
    try {
      await updateFact(factId, editText.trim())
      setEditingFact(null)
      setEditText('')
    } catch (err) {
      console.error('Failed to update fact:', err)
    }
  }

  const handleRemoveFact = async (factId: string) => {
    try {
      await removeFact(factId)
    } catch (err) {
      console.error('Failed to remove fact:', err)
    }
  }

  const groupedFacts = facts.reduce((acc, fact) => {
    if (!acc[fact.category]) acc[fact.category] = []
    acc[fact.category].push(fact)
    return acc
  }, {} as Record<ProfileCategory, UserProfileFact[]>)

  // Debug panel state - toggle with triple tap on loading spinner
  const [showDebug, setShowDebug] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [showGestureHint, setShowGestureHint] = useState(true)
  const debugTapCount = useRef(0)
  const debugTapTimer = useRef<NodeJS.Timeout | null>(null)

  // Hide gesture hint after first interaction
  useEffect(() => {
    if (showProfile || showHistory) {
      setShowGestureHint(false)
    }
  }, [showProfile, showHistory])

  // Copy message to clipboard
  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Export conversation as markdown
  const handleExportConversation = () => {
    if (messages.length === 0) return

    const title = currentConversation?.title || 'Path Finder Conversation'
    const date = new Date().toLocaleDateString()

    let markdown = `# ${title}\n`
    markdown += `*Exported on ${date}*\n\n---\n\n`

    messages.forEach(msg => {
      const role = msg.role === 'user' ? 'You' : 'Path Finder'
      markdown += `## ${role}\n\n${msg.content}\n\n---\n\n`
    })

    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${date}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDebugTap = () => {
    debugTapCount.current++
    if (debugTapTimer.current) clearTimeout(debugTapTimer.current)
    debugTapTimer.current = setTimeout(() => {
      if (debugTapCount.current >= 3) {
        setShowDebug(prev => !prev)
      }
      debugTapCount.current = 0
    }, 500)
  }

  // Only block on initialized - the timeout will force this true after 5s
  // Don't block on factsLoading/convoLoading or the timeout won't help
  if (!initialized) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-180px)] gap-4">
        <div onClick={handleDebugTap}>
          <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
        </div>
        {/* Debug info - always visible during loading */}
        <div className="text-xs text-slate-500 text-center px-4 space-y-1">
          <p>hasInitialData: {hasInitialData ? 'YES' : 'NO'}</p>
          <p>initialMessages: {initialMessages?.length ?? 'undefined'}</p>
          <p>initialConvo: {initialConversation?.id ? 'YES' : 'NO'}</p>
          <p>factsLoading: {factsLoading ? 'YES' : 'NO'}</p>
          <p>convoLoading: {convoLoading ? 'YES' : 'NO'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      {/* Debug indicator - tap 3x on Profile button to toggle full debug */}
      {showDebug && (
        <div className="px-4 py-2 bg-yellow-500/20 border-b border-yellow-500/30 text-xs text-yellow-400 space-y-1">
          <p>DEBUG MODE</p>
          <p>hasInitialData: {hasInitialData ? 'YES' : 'NO'}</p>
          <p>initialMessages: {initialMessages?.length ?? 'undefined'}</p>
          <p>initialConvo: {initialConversation?.id?.slice(0, 8) ?? 'none'}</p>
          <p>currentConvo: {currentConversation?.id?.slice(0, 8) ?? 'none'}</p>
          <p>messages in state: {messages.length}</p>
          <p>facts: {facts.length}</p>
        </div>
      )}

      {/* Profile & History Toggle Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              handleDebugTap()
              setShowProfile(!showProfile)
              setShowHistory(false)
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showProfile
                ? 'bg-teal-500/20 text-teal-400'
                : 'bg-slate-800 text-slate-400 hover:text-slate-300'
            }`}
          >
            <UserCircle className="w-4 h-4" />
            <span>Profile</span>
            {facts.length > 0 && (
              <span className="bg-slate-700 text-slate-300 text-xs px-1.5 py-0.5 rounded-full">
                {facts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setShowHistory(!showHistory); setShowProfile(false) }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showHistory
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-slate-800 text-slate-400 hover:text-slate-300'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>History</span>
            {conversations.length > 0 && (
              <span className="bg-slate-700 text-slate-300 text-xs px-1.5 py-0.5 rounded-full">
                {conversations.length}
              </span>
            )}
          </button>
        </div>
        <button
          onClick={handleNewChat}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Gesture Hint */}
      <AnimatePresence>
        {showGestureHint && !showProfile && !showHistory && messages.length <= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-center gap-2 py-2 text-xs text-slate-500 bg-slate-800/30 border-b border-slate-800"
          >
            <ChevronDown className="w-3 h-3 animate-bounce" />
            <span>Tap Profile or History to expand</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Panel (Collapsible) */}
      <AnimatePresence>
        {showProfile && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-slate-800 overflow-hidden"
          >
            <div className="p-4 bg-slate-900/30 max-h-[300px] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-300">What I know about you</h3>
                <p className="text-xs text-slate-500">Click to edit or remove</p>
              </div>

              {facts.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-6 px-4"
                >
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30 flex items-center justify-center">
                    <UserCircle className="w-6 h-6 text-purple-400" />
                  </div>
                  <h4 className="text-sm font-medium text-slate-300 mb-2">Your profile is empty</h4>
                  <p className="text-xs text-slate-500 mb-4 max-w-[220px] mx-auto">
                    As we chat, I&apos;ll remember key details about you — like your background, goals, and what you&apos;re working on.
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                    {(['background', 'skills', 'goals'] as ProfileCategory[]).map((category, index) => (
                      <motion.span
                        key={category}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 + index * 0.1 }}
                        className={`text-[10px] px-2 py-0.5 rounded border ${CATEGORY_COLORS[category]}`}
                      >
                        {CATEGORY_LABELS[category]}
                      </motion.span>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-600 flex items-center justify-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Start chatting to build your profile
                  </p>
                </motion.div>
              ) : (
                <div className="space-y-3">
                  {(Object.keys(CATEGORY_LABELS) as ProfileCategory[]).map(category => {
                    const categoryFacts = groupedFacts[category] || []
                    if (categoryFacts.length === 0 && addingFact !== category) return null

                    return (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded border ${CATEGORY_COLORS[category]}`}>
                            {CATEGORY_LABELS[category]}
                          </span>
                          {addingFact !== category && (
                            <button
                              onClick={() => setAddingFact(category)}
                              className="text-slate-500 hover:text-slate-300"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <ul className="space-y-1">
                          {categoryFacts.map(fact => (
                            <li key={fact.id} className="group flex items-start gap-2">
                              {editingFact === fact.id ? (
                                <div className="flex-1 flex gap-1">
                                  <input
                                    type="text"
                                    value={editText}
                                    onChange={e => setEditText(e.target.value)}
                                    className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleUpdateFact(fact.id)}
                                    className="p-1 text-green-400 hover:text-green-300"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingFact(null)}
                                    className="p-1 text-slate-400 hover:text-slate-300"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <span className="text-sm text-slate-300 flex-1">{fact.fact}</span>
                                  <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                                    <button
                                      onClick={() => {
                                        setEditingFact(fact.id)
                                        setEditText(fact.fact)
                                      }}
                                      className="p-1 text-slate-500 hover:text-slate-300"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleRemoveFact(fact.id)}
                                      className="p-1 text-slate-500 hover:text-red-400"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </li>
                          ))}
                          {addingFact === category && (
                            <li className="flex gap-1">
                              <input
                                type="text"
                                value={newFactText}
                                onChange={e => setNewFactText(e.target.value)}
                                placeholder={`Add ${CATEGORY_LABELS[category].toLowerCase()}...`}
                                className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white placeholder-slate-500"
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleAddFact()}
                              />
                              <button
                                onClick={handleAddFact}
                                className="p-1 text-green-400 hover:text-green-300"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setAddingFact(null)
                                  setNewFactText('')
                                }}
                                className="p-1 text-slate-400 hover:text-slate-300"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </li>
                          )}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Quick add buttons for empty categories */}
              {facts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-slate-800">
                  {(Object.keys(CATEGORY_LABELS) as ProfileCategory[])
                    .filter(cat => !groupedFacts[cat]?.length)
                    .map(category => (
                      <button
                        key={category}
                        onClick={() => setAddingFact(category)}
                        className={`text-xs px-2 py-1 rounded border opacity-50 hover:opacity-100 ${CATEGORY_COLORS[category]}`}
                      >
                        + {CATEGORY_LABELS[category]}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Panel (Collapsible) */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-slate-800 overflow-hidden"
          >
            <div className="p-4 bg-slate-900/30 max-h-[300px] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-300">Conversation History</h3>
                <div className="flex items-center gap-2">
                  {messages.length > 0 && (
                    <button
                      onClick={handleExportConversation}
                      className="text-xs text-slate-500 hover:text-teal-400 flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Export
                    </button>
                  )}
                  <p className="text-xs text-slate-500">Tap to load</p>
                </div>
              </div>

              {conversations.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No previous conversations</p>
              ) : (
                <div className="space-y-2">
                  {conversations.map(convo => (
                    <div
                      key={convo.id}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                        currentConversation?.id === convo.id
                          ? 'bg-purple-500/20 border border-purple-500/30'
                          : 'bg-slate-800/50 hover:bg-slate-800'
                      }`}
                      onClick={() => handleLoadConversation(convo.id)}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="text-sm text-slate-200 truncate">
                          {convo.title || 'Untitled conversation'}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(convo.updated_at), { addSuffix: true })}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm('Delete this conversation?')) {
                            handleArchiveConversation(convo.id)
                          }
                        }}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Feedback Toast */}
      <AnimatePresence>
        {actionFeedback && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-4 my-2 px-4 py-2 bg-teal-500/20 border border-teal-500/30 rounded-lg flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4 text-teal-400" />
            <span className="text-sm text-teal-400">{actionFeedback}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Error Toast */}
      <AnimatePresence>
        {saveError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-4 my-2 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2"
          >
            <X className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-400">{saveError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Projects Link */}
      {existingProjects.length > 0 && (
        <div className="mx-4 mb-2">
          <Link
            href="/projects"
            className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            <span>View {existingProjects.length} project{existingProjects.length !== 1 ? 's' : ''}</span>
          </Link>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div
                className={`
                  flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                  ${message.role === 'user'
                    ? 'bg-teal-500/20'
                    : 'bg-purple-500/20'
                  }
                `}
              >
                {message.role === 'user' ? (
                  <User className="w-4 h-4 text-teal-400" />
                ) : (
                  <Sparkles className="w-4 h-4 text-purple-400" />
                )}
              </div>

              {/* Message Content */}
              <div className="flex-1 max-w-[85%] space-y-3">
                <div className="group relative">
                  <div
                    className={`
                      rounded-2xl px-4 py-3
                      ${message.role === 'user'
                        ? 'bg-teal-500/10 border border-teal-500/20'
                        : 'bg-slate-800/50 border border-slate-700/50'
                      }
                    `}
                  >
                    {message.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-white whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                  {/* Copy button - always visible on mobile, hover on desktop */}
                  <button
                    onClick={() => handleCopyMessage(message.id, message.content)}
                    className={`absolute -bottom-2 right-2 p-1.5 rounded-lg text-xs transition-all
                      ${copiedMessageId === message.id
                        ? 'bg-green-500/20 text-green-400 opacity-100'
                        : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-white md:opacity-0 md:group-hover:opacity-100'
                      }`}
                  >
                    {copiedMessageId === message.id ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>

                {/* Project Action Cards - Clickable */}
                {message.actionResults && message.actionResults.length > 0 && (
                  <div className="space-y-2">
                    {message.actionResults.map((result, idx) => {
                      // Determine if this result has a clickable link
                      const hasLink = result.milestoneId && result.projectId
                      const linkHref = hasLink
                        ? `/projects/${result.projectId}/milestone/${result.milestoneId}`
                        : result.projectId
                          ? `/projects/${result.projectId}`
                          : null

                      const cardContent = (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={`
                            bg-gradient-to-br rounded-xl p-3
                            ${result.isIdea
                              ? 'from-amber-500/20 to-orange-500/20 border border-amber-500/30'
                              : 'from-teal-500/20 to-purple-500/20 border border-teal-500/30'}
                            ${linkHref ? 'cursor-pointer hover:border-teal-400/50 transition-colors' : ''}
                          `}
                        >
                          <div className="flex items-center gap-2">
                            {result.type === 'create_project' ? (
                              <Rocket className="w-4 h-4 text-purple-400" />
                            ) : result.isIdea ? (
                              <Sparkles className="w-4 h-4 text-amber-400" />
                            ) : result.type === 'complete_milestone' ? (
                              <CheckCircle className="w-4 h-4 text-green-400" />
                            ) : (
                              <FolderPlus className="w-4 h-4 text-teal-400" />
                            )}
                            <span className={`text-sm font-medium ${
                              result.isIdea ? 'text-amber-400' : 'text-teal-400'
                            }`}>
                              {result.text}
                            </span>
                          </div>
                          {linkHref && (
                            <p className="text-xs text-slate-500 mt-1 ml-6">Tap to view</p>
                          )}
                        </motion.div>
                      )

                      return linkHref ? (
                        <Link key={idx} href={linkHref}>
                          {cardContent}
                        </Link>
                      ) : (
                        <div key={idx}>{cardContent}</div>
                      )
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading Indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-800 p-4 bg-slate-900">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Share your thoughts..."
              rows={1}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50"
              style={{
                minHeight: '48px',
                maxHeight: '120px',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-12 h-12 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Send className="w-5 h-5 text-white" />
            )}
          </button>
        </form>
        <p className="text-xs text-slate-500 mt-2">
          Press Enter to send • Conversations auto-save
        </p>
      </div>
    </div>
  )
}
