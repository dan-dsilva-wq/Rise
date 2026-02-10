'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Sparkles, UserCircle, Plus, X, Check, Edit2, Trash2, MessageSquare, Clock, FolderPlus, CheckCircle, Download, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { useProfileFacts } from '@/lib/hooks/useProfileFacts'
import { usePathFinderConversation } from '@/lib/hooks/usePathFinderConversation'
import { useVoiceConversation } from '@/lib/hooks/useVoiceConversation'
import { createClient } from '@/lib/supabase/client'
import { addDebugLog } from '@/components/ui/ConnectionStatus'
import type { ProfileCategory, UserProfileFact } from '@/lib/supabase/types'
import { formatDistanceToNow } from 'date-fns'
import { CATEGORY_COLORS, CATEGORY_LABELS, INITIAL_MESSAGES, transformMessage } from './chat-constants'
import type { ActionResult, ExistingProject, Message, PathFinderChatProps, ProjectAction } from './types'
import { PathFinderMessageList } from './PathFinderMessageList'
import { PathFinderComposer } from './PathFinderComposer'
import { executeProjectActions as runProjectActions, fetchExistingProjects } from './project-actions'

export function PathFinderChat({ userId, initialConversation, initialConversations, initialMessages, initialFacts, onboardingMode, onProjectCreated }: PathFinderChatProps) {
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

  const fetchProjects = useCallback(async (): Promise<ExistingProject[] | null> => {
    const projects = await fetchExistingProjects({ client, userId })
    setExistingProjects(projects || [])
    return projects
  }, [client, userId])

  const executeProjectActions = useCallback(
    async (actions: ProjectAction[]) =>
      runProjectActions({
        actions,
        client,
        userId,
        fetchProjects,
      }),
    [client, fetchProjects, userId],
  )

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
          content: onboardingMode ? INITIAL_MESSAGES.onboarding : hasProfile ? INITIAL_MESSAGES.withProfile : INITIAL_MESSAGES.noProfile,
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
          const initialContent = onboardingMode ? INITIAL_MESSAGES.onboarding : hasProfile ? INITIAL_MESSAGES.withProfile : INITIAL_MESSAGES.noProfile

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
          content: onboardingMode ? INITIAL_MESSAGES.onboarding : hasProfile ? INITIAL_MESSAGES.withProfile : INITIAL_MESSAGES.noProfile,
        }])
      }
      addDebugLog('success', 'init() complete')
      setInitialized(true)
    }
    init()

    return () => clearTimeout(timeoutId)
  }, [factsLoading, convoLoading, initialized, userId, loadMostRecent, setCurrentDirect, createConversation, saveMessage, facts.length, fetchProjects, hasInitialData, initialMessages, initialFacts, initialConversation, onboardingMode])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e?: React.FormEvent, overrideInput?: string) => {
    e?.preventDefault()

    const messageText = (overrideInput ?? input).trim()
    if (!messageText || isLoading) return

    addDebugLog('info', 'Sending message', messageText.slice(0, 50))

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
      content: messageText,
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
        const createdProject = actionResults.find(r => r.type === 'create_project')
        if (createdProject && onProjectCreated) {
          onProjectCreated(createdProject.projectId!, createdProject.projectName!)
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
      void speakText(assistantMessage.content)

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
        const userFirstMsg = messages.find(m => m.role === 'user')?.content || messageText
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

  const handleVoiceInput = async () => {
    if (isLoading && !isRecording) return
    const transcript = await toggleRecordingAndTranscribe()
    if (!transcript) return
    await handleSubmit(undefined, transcript)
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
  const {
    isRecording,
    isTranscribing,
    isSpeaking,
    isMuted,
    voiceError,
    toggleRecordingAndTranscribe,
    toggleMute,
    clearVoiceError,
    speakText,
  } = useVoiceConversation()
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
      {!onboardingMode && (
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
      )}

      {/* Gesture Hint */}
      <AnimatePresence>
        {showGestureHint && !onboardingMode && !showProfile && !showHistory && messages.length <= 2 && (
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
      {existingProjects.length > 0 && !onboardingMode && (
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
      <PathFinderMessageList
        messages={messages}
        isLoading={isLoading}
        copiedMessageId={copiedMessageId}
        onCopyMessage={handleCopyMessage}
        messagesEndRef={messagesEndRef}
      />

      {/* Input Area */}
      <PathFinderComposer
        input={input}
        isLoading={isLoading}
        inputRef={inputRef}
        onInputChange={setInput}
        onKeyDown={handleKeyDown}
        onSubmit={handleSubmit}
        voice={{
          isRecording,
          isTranscribing,
          isSpeaking,
          isMuted,
          error: voiceError,
          disabled: isLoading && !isRecording,
          onMicClick: handleVoiceInput,
          onToggleMute: toggleMute,
          onDismissError: clearVoiceError,
        }}
      />
    </div>
  )
}
