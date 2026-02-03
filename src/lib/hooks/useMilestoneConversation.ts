'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addDebugLog } from '@/components/ui/ConnectionStatus'
import type {
  MilestoneConversation,
  MilestoneMessage,
  MilestoneConversationInsert,
  MilestoneMessageInsert,
} from '@/lib/supabase/types'

interface ConversationWithMessages extends MilestoneConversation {
  messages: MilestoneMessage[]
}

export function useMilestoneConversation(userId: string | undefined, milestoneId: string | undefined) {
  const [currentConversation, setCurrentConversation] = useState<ConversationWithMessages | null>(null)
  const [loading, setLoading] = useState(true)

  const currentConvoRef = useRef<ConversationWithMessages | null>(null)

  const supabaseClient = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseClient as any

  // Load or create conversation for this milestone
  const initConversation = useCallback(async () => {
    if (!userId || !milestoneId) {
      setLoading(false)
      return null
    }

    setLoading(true)
    addDebugLog('info', 'MilestoneMode init', `milestone=${milestoneId.slice(0, 8)}`)

    try {
      // Check for existing conversation
      const { data: existing, error: fetchError } = await supabase
        .from('milestone_conversations')
        .select('*')
        .eq('milestone_id', milestoneId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine
        addDebugLog('error', 'Fetch convo failed', fetchError.message)
      }

      let conversation: MilestoneConversation

      if (existing) {
        conversation = existing
        addDebugLog('success', 'Found existing convo', conversation.id.slice(0, 8))
      } else {
        // Create new conversation
        const newConvo: MilestoneConversationInsert = {
          milestone_id: milestoneId,
          user_id: userId,
        }

        const { data: created, error: createError } = await supabase
          .from('milestone_conversations')
          .insert(newConvo)
          .select()
          .single()

        if (createError) {
          addDebugLog('error', 'Create convo failed', createError.message)
          throw createError
        }

        conversation = created
        addDebugLog('success', 'Created new convo', conversation.id.slice(0, 8))
      }

      // Fetch messages for this conversation
      const { data: messages, error: msgsError } = await supabase
        .from('milestone_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })

      if (msgsError) {
        addDebugLog('error', 'Fetch messages failed', msgsError.message)
      }

      const fullConversation: ConversationWithMessages = {
        ...conversation,
        messages: messages || [],
      }

      currentConvoRef.current = fullConversation
      setCurrentConversation(fullConversation)
      addDebugLog('success', 'Loaded conversation', `${fullConversation.messages.length} messages`)

      return fullConversation
    } catch (err) {
      addDebugLog('error', 'initConversation failed', String(err))
      return null
    } finally {
      setLoading(false)
    }
  }, [userId, milestoneId, supabase])

  // Add a message to the current conversation
  const addMessage = useCallback(async (
    role: 'user' | 'assistant',
    content: string
  ): Promise<MilestoneMessage | null> => {
    const convo = currentConvoRef.current
    if (!userId || !convo) {
      addDebugLog('error', 'addMessage: no convo', `userId=${!!userId} convo=${!!convo}`)
      return null
    }

    try {
      const newMessage: MilestoneMessageInsert = {
        conversation_id: convo.id,
        user_id: userId,
        role,
        content,
      }

      const { data, error } = await supabase
        .from('milestone_messages')
        .insert(newMessage)
        .select()
        .single()

      if (error) {
        addDebugLog('error', 'addMessage failed', `${error.code}: ${error.message}`)
        throw error
      }

      const message = data as MilestoneMessage
      addDebugLog('success', `${role} msg saved`, message.id.slice(0, 8))

      // Update ref and state
      const updatedConvo = {
        ...convo,
        messages: [...convo.messages, message],
        updated_at: new Date().toISOString(),
      }
      currentConvoRef.current = updatedConvo
      setCurrentConversation(updatedConvo)

      // Update conversation's updated_at in background
      supabase
        .from('milestone_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convo.id)
        .then(() => {})

      return message
    } catch (err) {
      addDebugLog('error', 'addMessage exception', String(err))
      return null
    }
  }, [userId, supabase])

  // Set conversation directly (for server-provided data)
  const setCurrentDirect = useCallback((conversation: MilestoneConversation, messages: MilestoneMessage[]) => {
    const fullConversation: ConversationWithMessages = {
      ...conversation,
      messages,
    }
    currentConvoRef.current = fullConversation
    setCurrentConversation(fullConversation)
    setLoading(false)
    addDebugLog('success', 'Convo set directly', conversation.id.slice(0, 8))
  }, [])

  // Initialize on mount
  useEffect(() => {
    initConversation()
  }, [initConversation])

  return {
    currentConversation,
    loading,
    addMessage,
    setCurrentDirect,
    refresh: initConversation,
  }
}
