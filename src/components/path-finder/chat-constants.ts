import type { ProfileCategory } from '@/lib/supabase/types'
import type { ActionResult, Message } from './types'

export const CATEGORY_LABELS: Record<ProfileCategory, string> = {
  background: 'Background',
  skills: 'Skills',
  situation: 'Situation',
  goals: 'Goals',
  preferences: 'Preferences',
  constraints: 'Constraints',
}

export const CATEGORY_COLORS: Record<ProfileCategory, string> = {
  background: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  skills: 'bg-green-500/20 text-green-400 border-green-500/30',
  situation: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  goals: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  preferences: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  constraints: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export const INITIAL_MESSAGES = {
  withProfile: `Welcome back! I've got your profile info ready - I know a bit about your background, skills, and what you're working toward.

Let's pick up where we left off. **What's on your mind today?** Any new developments, or want to explore a specific direction?`,
  noProfile: `Hey! I'm here to help you figure out what to build.

This isn't a quiz where I give you a generic answer at the end. We're going to have a real conversation to find something that actually fits YOUR situation.

As we talk, I'll remember important things you share so we can build on our conversations over time.

Let's start simple: **What does "freedom" mean to you?** Is it about money, time, location, the type of work you do, or something else entirely?`,
  freshStart: `Fresh start! I still have your profile saved, so I know your background. **What would you like to explore today?**`,
  onboarding: `Hey! I'm Path Finder — I help you figure out what to build for freedom.

Let's have a quick chat so I can understand what you're working toward, and I'll set up your first project.

Tell me a bit about yourself — what are you interested in, and what does success look like for you?`,
}

const ACTION_RESULTS_PATTERN = /\n\n<!-- ACTION_RESULTS:(.*?) -->/

function parseMessageWithActions(content: string): { content: string; actionResults?: ActionResult[] } {
  const match = content.match(ACTION_RESULTS_PATTERN)
  if (match) {
    try {
      const actionResults = JSON.parse(match[1]) as ActionResult[]
      const cleanContent = content.replace(ACTION_RESULTS_PATTERN, '')
      return { content: cleanContent, actionResults }
    } catch {
      return { content }
    }
  }
  return { content }
}

export function transformMessage(m: { id: string; role: 'user' | 'assistant'; content: string }): Message {
  const { content, actionResults } = parseMessageWithActions(m.content)
  return {
    id: m.id,
    role: m.role,
    content,
    actionResults,
  }
}
