'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Loader2, User, Sparkles, UserCircle, Plus, X, Check, Edit2, Trash2, MessageSquare, Clock, FolderPlus, CheckCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import { useProfileFacts } from '@/lib/hooks/useProfileFacts'
import { usePathFinderConversation } from '@/lib/hooks/usePathFinderConversation'
import { createClient } from '@/lib/supabase/client'
import { addDebugLog } from '@/components/ui/ConnectionStatus'
import type { ProfileCategory, UserProfileFact } from '@/lib/supabase/types'
import { formatDistanceToNow } from 'date-fns'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  projectActions?: string[] // Shows what project actions were taken
}

interface ProjectAction {
  type: 'create' | 'add_milestone' | 'update_status' | 'edit_milestone' | 'complete_milestone' | 'discard_milestone' | 'reorder_milestones'
  projectId?: string
  milestoneId?: string
  name?: string
  description?: string
  milestones?: string[]
  newMilestone?: string
  newTitle?: string
  newStatus?: 'discovery' | 'planning' | 'building' | 'launched' | 'paused'
  milestoneOrder?: string[] // Array of milestone IDs in new order
}

interface ExistingProject {
  id: string
  name: string
  description: string | null
  status: string
  milestones: { id: string; title: string; status: string; sort_order: number }[]
}

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
  const fetchProjects = useCallback(async () => {
    if (!userId) return

    const { data: projects } = await client
      .from('projects')
      .select('id, name, description, status')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (projects) {
      const projectsWithMilestones: ExistingProject[] = []
      for (const project of projects) {
        const { data: milestones } = await client
          .from('milestones')
          .select('id, title, status, sort_order')
          .eq('project_id', project.id)
          .neq('status', 'discarded') // Don't show discarded milestones
          .order('sort_order', { ascending: true })

        projectsWithMilestones.push({
          ...project,
          milestones: milestones || [],
        })
      }
      setExistingProjects(projectsWithMilestones)
    }
  }, [userId, client])

  // Execute project actions from AI
  const executeProjectActions = async (actions: ProjectAction[]): Promise<string[]> => {
    if (!userId) {
      addDebugLog('error', 'No userId for actions')
      return []
    }
    const results: string[] = []
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

          // Create milestones
          if (action.milestones && action.milestones.length > 0) {
            const milestonesData = action.milestones.map((title, index) => ({
              project_id: projectData.id,
              user_id: userId,
              title,
              sort_order: index,
              status: 'pending',
              xp_reward: 50,
            }))
            await client.from('milestones').insert(milestonesData)
          }

          results.push(`Created project: ${action.name}`)
        } else if (action.type === 'add_milestone' && action.projectId && action.newMilestone) {
          // Get current milestone count for sort order
          const { data: existing } = await client
            .from('milestones')
            .select('id')
            .eq('project_id', action.projectId)

          await client.from('milestones').insert({
            project_id: action.projectId,
            user_id: userId,
            title: action.newMilestone,
            sort_order: existing?.length || 0,
            status: 'pending',
            xp_reward: 50,
          })

          const project = existingProjects.find(p => p.id === action.projectId)
          results.push(`Added milestone to ${project?.name || 'project'}`)
        } else if (action.type === 'update_status' && action.projectId && action.newStatus) {
          await client
            .from('projects')
            .update({ status: action.newStatus })
            .eq('id', action.projectId)

          const project = existingProjects.find(p => p.id === action.projectId)
          results.push(`Updated ${project?.name || 'project'} to ${action.newStatus}`)
        } else if (action.type === 'edit_milestone' && action.milestoneId && action.newTitle) {
          // Edit milestone title
          addDebugLog('info', 'Edit milestone', `id=${action.milestoneId.slice(0, 8)} title=${action.newTitle}`)

          // First check if milestone exists
          const { data: existing, error: findError } = await client
            .from('milestones')
            .select('id, title')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !existing) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push(`Failed: Milestone not found`)
            continue
          }

          const { error: updateError } = await client
            .from('milestones')
            .update({ title: action.newTitle, updated_at: new Date().toISOString() })
            .eq('id', action.milestoneId)

          if (updateError) {
            addDebugLog('error', 'Edit failed', updateError.message)
            results.push(`Failed to edit: ${updateError.message}`)
          } else {
            addDebugLog('success', 'Milestone edited', action.newTitle)
            results.push(`Updated milestone: ${action.newTitle}`)
          }
        } else if (action.type === 'complete_milestone' && action.milestoneId) {
          // Mark milestone as complete
          addDebugLog('info', 'Complete milestone', `id=${action.milestoneId.slice(0, 8)}`)

          const { data: milestone, error: findError } = await client
            .from('milestones')
            .select('id, title, xp_reward, status')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !milestone) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push(`Failed: Milestone not found`)
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
            results.push(`Failed to complete: ${updateError.message}`)
          } else {
            // Award XP
            if (milestone.xp_reward) {
              await client.rpc('increment_xp', {
                user_id: userId,
                xp_amount: milestone.xp_reward,
              })
            }
            addDebugLog('success', 'Milestone completed', `${milestone.title} +${milestone.xp_reward || 50}XP`)
            results.push(`Completed: ${milestone.title} (+${milestone.xp_reward || 50} XP)`)
          }
        } else if (action.type === 'discard_milestone' && action.milestoneId) {
          // Discard milestone (soft delete - keeps data)
          addDebugLog('info', 'Discard milestone', `id=${action.milestoneId.slice(0, 8)}`)

          const { data: milestone, error: findError } = await client
            .from('milestones')
            .select('id, title, status')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !milestone) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push(`Failed: Milestone not found`)
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
            results.push(`Failed to discard: ${updateError.message}`)
          } else {
            addDebugLog('success', 'Milestone discarded', milestone.title)
            results.push(`Discarded: ${milestone.title}`)
          }
        } else if (action.type === 'reorder_milestones' && action.projectId && action.milestoneOrder) {
          // Reorder milestones
          addDebugLog('info', 'Reorder milestones', `project=${action.projectId.slice(0, 8)} order=${action.milestoneOrder.length} items`)

          const project = existingProjects.find(p => p.id === action.projectId)
          if (!project) {
            addDebugLog('error', 'Project not found', action.projectId)
            results.push(`Failed: Project not found`)
            continue
          }

          // Update each milestone's sort_order
          let success = true
          for (let i = 0; i < action.milestoneOrder.length; i++) {
            const milestoneId = action.milestoneOrder[i]
            const { error } = await client
              .from('milestones')
              .update({ sort_order: i, updated_at: new Date().toISOString() })
              .eq('id', milestoneId)

            if (error) {
              addDebugLog('error', 'Reorder failed', `milestone ${milestoneId.slice(0, 8)}: ${error.message}`)
              success = false
              break
            }
          }

          if (success) {
            addDebugLog('success', 'Milestones reordered', `${action.milestoneOrder.length} milestones`)
            results.push(`Reordered milestones in ${project.name}`)
          } else {
            results.push(`Failed to reorder milestones`)
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        addDebugLog('error', `Action ${action.type} failed`, errMsg)
        console.error('Failed to execute project action:', err)
        results.push(`Failed: ${action.type} - ${errMsg}`)
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
      setMessages(initialMessages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
      })))
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
          setMessages(recent.messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })))
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
      const response = await fetch('/api/path-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          profileContext: profileSummary || undefined,
          existingProjects: existingProjects.length > 0 ? existingProjects : undefined,
        }),
      })

      if (!response.ok) {
        addDebugLog('error', 'AI API error', `Status: ${response.status}`)
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      addDebugLog('success', 'AI response received')

      // Execute any project actions from the AI
      let actionResults: string[] = []
      if (data.projectActions && data.projectActions.length > 0) {
        addDebugLog('info', 'Executing project actions', `${data.projectActions.length} actions`)
        actionResults = await executeProjectActions(data.projectActions)
        if (actionResults.length > 0) {
          setActionFeedback(actionResults.join(' | '))
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
        projectActions: actionResults.length > 0 ? actionResults : undefined,
      }

      setMessages(prev => [...prev, assistantMessage])

      // Save assistant message to database (if we have a conversation)
      if (canSaveToCloud) {
        try {
          const saved = await saveMessage('assistant', assistantMessage.content)
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
      setMessages(convo.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
      })))
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
  const debugTapCount = useRef(0)
  const debugTapTimer = useRef<NodeJS.Timeout | null>(null)

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
                <p className="text-sm text-slate-500 italic">
                  No profile yet. As we chat, important info will be saved here.
                </p>
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
                <p className="text-xs text-slate-500">Tap to load, X to delete</p>
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

                {/* Project Action Feedback */}
                {message.projectActions && message.projectActions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-gradient-to-br from-teal-500/20 to-purple-500/20 border border-teal-500/30 rounded-xl p-3"
                  >
                    <div className="flex items-center gap-2">
                      <FolderPlus className="w-4 h-4 text-teal-400" />
                      <span className="text-sm text-teal-400">
                        {message.projectActions.join(' • ')}
                      </span>
                    </div>
                  </motion.div>
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
