'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getFromCache, setCache, getCacheKey } from '@/lib/cache'
import { addDebugLog } from '@/components/ui/ConnectionStatus'
import type {
  PathFinderConversation,
  PathFinderMessage,
  PathFinderConversationInsert,
  PathFinderMessageInsert,
} from '@/lib/supabase/types'

interface ConversationWithMessages extends PathFinderConversation {
  messages: PathFinderMessage[]
}

export function usePathFinderConversation(userId: string | undefined) {
  const [conversations, setConversations] = useState<PathFinderConversation[]>([])
  const [currentConversation, setCurrentConversation] = useState<ConversationWithMessages | null>(null)
  const [loading, setLoading] = useState(true)

  // Use ref to track current conversation for immediate access (fixes race condition)
  const currentConvoRef = useRef<ConversationWithMessages | null>(null)

  const supabaseClient = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseClient as any

  // Fetch all conversations for the user
  const fetchConversations = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    // Try cache first for instant display
    const cacheKey = getCacheKey(userId, 'conversations')
    const cached = getFromCache<PathFinderConversation[]>(cacheKey)
    if (cached) {
      setConversations(cached)
      setLoading(false)
      addDebugLog('info', 'Convos from cache', `${cached.length} found`)
    } else {
      setLoading(true)
    }

    // Always fetch fresh in background
    try {
      const { data, error } = await supabase
        .from('path_finder_conversations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })

      if (error) {
        addDebugLog('error', 'fetchConversations failed', error.message)
        return
      }

      const freshConversations = (data as PathFinderConversation[]) || []
      setConversations(freshConversations)
      setCache(cacheKey, freshConversations)
      addDebugLog('success', 'Convos fetched', `${freshConversations.length} found`)
    } catch (err) {
      addDebugLog('error', 'fetchConversations error', String(err))
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  // Load a specific conversation with its messages
  const loadConversation = useCallback(async (conversationId: string) => {
    if (!userId) return null

    try {
      // Get the conversation and messages in parallel
      const convoPromise = supabase
        .from('path_finder_conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single()

      const messagesPromise = supabase
        .from('path_finder_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      const [convoResult, messagesResult] = await Promise.all([convoPromise, messagesPromise])

      if (convoResult.error || !convoResult.data) {
        console.error('Error loading conversation:', convoResult.error)
        return null
      }

      const fullConversation: ConversationWithMessages = {
        ...(convoResult.data as PathFinderConversation),
        messages: (messagesResult.data as PathFinderMessage[]) || [],
      }

      currentConvoRef.current = fullConversation
      setCurrentConversation(fullConversation)
      return fullConversation
    } catch (err) {
      console.error('Failed to load conversation:', err)
      return null
    }
  }, [userId, supabase])

  // Load the most recent conversation or return null
  const loadMostRecent = useCallback(async (): Promise<ConversationWithMessages | null> => {
    if (!userId) return null

    try {
      const { data, error } = await supabase
        .from('path_finder_conversations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) {
        // No conversations exist yet - this is fine
        return null
      }

      return loadConversation(data.id)
    } catch (err) {
      console.error('Failed to load most recent:', err)
      return null
    }
  }, [userId, supabase, loadConversation])

  // Create a new conversation
  const createConversation = useCallback(async (title?: string): Promise<ConversationWithMessages | null> => {
    addDebugLog('info', 'Creating conversation')

    if (!userId) {
      addDebugLog('error', 'createConversation: No userId')
      return null
    }

    try {
      const newConvo: PathFinderConversationInsert = {
        user_id: userId,
        title: title || null,
      }

      const { data, error } = await supabase
        .from('path_finder_conversations')
        .insert(newConvo)
        .select()
        .single()

      if (error) {
        addDebugLog('error', 'createConversation failed', `${error.code}: ${error.message}`)
        throw error
      }

      const fullConversation: ConversationWithMessages = {
        ...(data as PathFinderConversation),
        messages: [],
      }

      addDebugLog('success', 'Conversation created', fullConversation.id.slice(0, 8))

      // Update ref immediately for race condition fix
      currentConvoRef.current = fullConversation
      setCurrentConversation(fullConversation)
      setConversations(prev => {
        const updated = [data as PathFinderConversation, ...prev]
        setCache(getCacheKey(userId, 'conversations'), updated)
        return updated
      })
      return fullConversation
    } catch (err) {
      addDebugLog('error', 'createConversation exception', String(err))
      return null
    }
  }, [userId, supabase])

  // Add a message to the current conversation (uses ref for immediate access)
  const addMessage = useCallback(async (
    role: 'user' | 'assistant',
    content: string
  ): Promise<PathFinderMessage | null> => {
    // Use ref for immediate access (fixes race condition after createConversation)
    const convo = currentConvoRef.current
    if (!userId || !convo) {
      addDebugLog('error', 'addMessage: no convo', `userId=${!!userId} convo=${!!convo}`)
      return null
    }

    try {
      const newMessage: PathFinderMessageInsert = {
        conversation_id: convo.id,
        user_id: userId,
        role,
        content,
      }

      const { data, error } = await supabase
        .from('path_finder_messages')
        .insert(newMessage)
        .select()
        .single()

      if (error) {
        addDebugLog('error', 'addMessage failed', `${error.code}: ${error.message}`)
        throw error
      }

      const message = data as PathFinderMessage
      addDebugLog('success', `${role} msg saved`, message.id.slice(0, 8))

      // Update ref and state
      const updatedConvo = {
        ...convo,
        messages: [...convo.messages, message],
        updated_at: new Date().toISOString(),
      }
      currentConvoRef.current = updatedConvo
      setCurrentConversation(updatedConvo)

      // Update the conversation's updated_at in background (don't await)
      supabase
        .from('path_finder_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convo.id)
        .then(() => {})

      return message
    } catch (err) {
      addDebugLog('error', 'addMessage exception', String(err))
      return null
    }
  }, [userId, supabase])

  // Update conversation title
  const updateTitle = useCallback(async (title: string) => {
    const convo = currentConvoRef.current
    if (!userId || !convo) return

    try {
      await supabase
        .from('path_finder_conversations')
        .update({ title })
        .eq('id', convo.id)

      const updatedConvo = { ...convo, title }
      currentConvoRef.current = updatedConvo
      setCurrentConversation(updatedConvo)
      setConversations(prev => prev.map(c =>
        c.id === convo.id ? { ...c, title } : c
      ))
    } catch (err) {
      console.error('Failed to update title:', err)
    }
  }, [userId, supabase])

  // Archive a conversation (soft delete with optimistic update)
  const archiveConversation = useCallback(async (conversationId: string) => {
    if (!userId) return

    // Optimistic update - remove immediately
    const archivedConvo = conversations.find(c => c.id === conversationId)
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== conversationId)
      setCache(getCacheKey(userId, 'conversations'), updated)
      return updated
    })
    if (currentConvoRef.current?.id === conversationId) {
      currentConvoRef.current = null
      setCurrentConversation(null)
    }

    const { error } = await supabase
      .from('path_finder_conversations')
      .update({ is_active: false })
      .eq('id', conversationId)
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to archive conversation:', error)
      // Rollback on error
      if (archivedConvo) {
        setConversations(prev => [...prev, archivedConvo].sort((a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        ))
      }
    } else {
      // Also invalidate cache to prevent stale data
      setCache(getCacheKey(userId, 'conversations'), conversations.filter(c => c.id !== conversationId))
    }
  }, [userId, supabase, conversations])

  // Start fresh (create new conversation)
  const startNew = useCallback(async () => {
    return createConversation()
  }, [createConversation])

  // Clear current conversation from state (doesn't delete)
  const clearCurrent = useCallback(() => {
    currentConvoRef.current = null
    setCurrentConversation(null)
  }, [])

  // Set current conversation directly (for when we already have the data from server)
  const setCurrentDirect = useCallback((conversation: PathFinderConversation, messages: PathFinderMessage[]) => {
    const fullConversation: ConversationWithMessages = {
      ...conversation,
      messages,
    }
    currentConvoRef.current = fullConversation
    setCurrentConversation(fullConversation)
    addDebugLog('success', 'Convo set directly', conversation.id.slice(0, 8))
  }, [])

  useEffect(() => {
    addDebugLog('info', 'Convo hook init', `userId=${!!userId}`)
    fetchConversations()
  }, [fetchConversations])

  return {
    conversations,
    currentConversation,
    loading,
    loadConversation,
    loadMostRecent,
    createConversation,
    addMessage,
    updateTitle,
    archiveConversation,
    startNew,
    clearCurrent,
    setCurrentDirect,
    refresh: fetchConversations,
  }
}
