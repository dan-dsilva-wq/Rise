'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  MilestoneStep,
  MilestoneStepInsert,
  MilestoneConversation,
  MilestoneMessage,
} from '@/lib/supabase/types'

function getClient() {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any
}

interface UseMilestoneModeOptions {
  milestoneId: string | undefined
  userId: string | undefined
}

export function useMilestoneMode({ milestoneId, userId }: UseMilestoneModeOptions) {
  const [steps, setSteps] = useState<MilestoneStep[]>([])
  const [conversation, setConversation] = useState<MilestoneConversation | null>(null)
  const [messages, setMessages] = useState<MilestoneMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [stepsExist, setStepsExist] = useState(false)

  // Fetch existing steps and conversation
  const fetchData = useCallback(async () => {
    if (!milestoneId || !userId) {
      setLoading(false)
      return
    }

    setLoading(true)
    const client = getClient()

    try {
      // Fetch steps
      const { data: stepsData, error: stepsError } = await client
        .from('milestone_steps')
        .select('*')
        .eq('milestone_id', milestoneId)
        .eq('user_id', userId)
        .order('sort_order')

      if (stepsError) {
        console.error('Error fetching steps:', stepsError)
      } else {
        const fetchedSteps = (stepsData || []) as MilestoneStep[]
        setSteps(fetchedSteps)
        setStepsExist(fetchedSteps.length > 0)
      }

      // Fetch active conversation
      const { data: convoData, error: convoError } = await client
        .from('milestone_conversations')
        .select('*')
        .eq('milestone_id', milestoneId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (convoError) {
        console.error('Error fetching conversation:', convoError)
      } else if (convoData) {
        setConversation(convoData as MilestoneConversation)

        // Fetch messages for this conversation
        const { data: messagesData } = await client
          .from('milestone_messages')
          .select('*')
          .eq('conversation_id', convoData.id)
          .order('created_at')

        setMessages((messagesData || []) as MilestoneMessage[])
      }
    } finally {
      setLoading(false)
    }
  }, [milestoneId, userId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Save AI-generated steps
  const saveSteps = async (newSteps: { text: string; type: 'action' | 'decision' | 'research' }[]) => {
    if (!milestoneId || !userId) return

    const client = getClient()

    // Insert all steps
    const stepsToInsert: MilestoneStepInsert[] = newSteps.map((step, idx) => ({
      milestone_id: milestoneId,
      user_id: userId,
      text: step.text,
      step_type: step.type,
      sort_order: idx,
    }))

    const { data, error } = await client
      .from('milestone_steps')
      .insert(stepsToInsert)
      .select()

    if (error) {
      console.error('Error saving steps:', error)
      return
    }

    setSteps(data as MilestoneStep[])
    setStepsExist(true)
  }

  // Toggle step completion
  const toggleStep = async (stepId: string) => {
    if (!userId) return

    const step = steps.find(s => s.id === stepId)
    if (!step) return

    const client = getClient()
    const newCompleted = !step.is_completed

    const { error } = await client
      .from('milestone_steps')
      .update({
        is_completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stepId)

    if (error) {
      console.error('Error toggling step:', error)
      return
    }

    setSteps(prev =>
      prev.map(s =>
        s.id === stepId
          ? { ...s, is_completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
          : s
      )
    )
  }

  // Create or get conversation with approach
  const getOrCreateConversation = async (approach: 'do-it' | 'guide') => {
    if (!milestoneId || !userId) return null

    // If we have a conversation with same approach, use it
    if (conversation && conversation.approach === approach) {
      return conversation
    }

    const client = getClient()

    // Create new conversation
    const { data, error } = await client
      .from('milestone_conversations')
      .insert({
        milestone_id: milestoneId,
        user_id: userId,
        approach,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating conversation:', error)
      return null
    }

    const newConvo = data as MilestoneConversation
    setConversation(newConvo)
    setMessages([])
    return newConvo
  }

  // Add message to conversation
  const addMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!userId || !conversation) return null

    const client = getClient()

    const { data, error } = await client
      .from('milestone_messages')
      .insert({
        conversation_id: conversation.id,
        user_id: userId,
        role,
        content,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding message:', error)
      return null
    }

    const newMessage = data as MilestoneMessage
    setMessages(prev => [...prev, newMessage])

    // Update conversation updated_at
    await client
      .from('milestone_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversation.id)

    return newMessage
  }

  // Add message optimistically (for immediate UI feedback)
  const addMessageOptimistic = (role: 'user' | 'assistant', content: string) => {
    const tempMessage: MilestoneMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: conversation?.id || '',
      user_id: userId || '',
      role,
      content,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMessage])
    return tempMessage
  }

  return {
    steps,
    stepsExist,
    conversation,
    messages,
    loading,
    saveSteps,
    toggleStep,
    getOrCreateConversation,
    addMessage,
    addMessageOptimistic,
    setMessages,
    refresh: fetchData,
  }
}
