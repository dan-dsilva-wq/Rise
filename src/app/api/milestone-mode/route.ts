import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

let anthropic: Anthropic | null = null
function getAnthropic() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropic
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ProjectContext {
  name: string
  description: string | null
  status: string
  milestones: {
    id: string
    title: string
    status: string
    sort_order: number
  }[]
}

interface MilestoneContext {
  id: string
  title: string
  description: string | null
  status: string
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set')
      return Response.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const supabaseClient = await createClient()
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { messages, milestone, project } = await request.json() as {
      messages: ChatMessage[]
      milestone: MilestoneContext
      project: ProjectContext
    }

    // Build context about the project and where this milestone fits
    const otherMilestones = project.milestones
      .filter(m => m.id !== milestone.id)
      .sort((a, b) => a.sort_order - b.sort_order)

    const completedCount = project.milestones.filter(m => m.status === 'completed').length
    const totalCount = project.milestones.length
    const currentIndex = project.milestones.findIndex(m => m.id === milestone.id) + 1

    const projectOverview = `
## Project Overview
**${project.name}** - ${project.description || 'No description'}
Status: ${project.status}
Progress: ${completedCount}/${totalCount} milestones complete

## All Milestones
${project.milestones.map((m, i) =>
  `${i + 1}. ${m.title} [${m.status}]${m.id === milestone.id ? ' <-- CURRENT' : ''}`
).join('\n')}
`

    const systemPrompt = `You are a tactical execution coach helping someone complete ONE specific milestone. You're like a friend sitting next to them saying "Okay, let's get this done."

${projectOverview}

## Current Milestone (Your ONLY Focus)
**${milestone.title}**
${milestone.description ? `Description: ${milestone.description}` : ''}
This is milestone ${currentIndex} of ${totalCount}.

## Your Role
You are NOT here to discuss the big picture or explore ideas. That's what Path Finder is for.
You ARE here to help them DO this one thing, RIGHT NOW.

## Your Approach
1. **Break it down** - What's the absolute smallest next action?
2. **Remove blockers** - "What's stopping you?" then help solve it
3. **Keep momentum** - One tiny step at a time
4. **Stay focused** - Gently redirect if they drift to other topics
5. **Celebrate progress** - Acknowledge each step forward

## Conversation Style
- Short, punchy responses (2-4 sentences usually)
- Ask ONE question at a time
- Be encouraging but not fake
- Use "we" language - you're doing this together
- If they're stuck, dig into WHY specifically

## Key Phrases
- "What's the very first thing you need to do?"
- "What's stopping you from starting right now?"
- "That sounds overwhelming. Let's break it smaller."
- "Done! What's next?"
- "You're making progress. Keep going."

## When They Complete the Milestone
When they say they're done or the milestone is complete:
1. Celebrate briefly
2. Ask them to mark it complete in the app
3. Suggest they take a short break or move to the next milestone

## Example Flow
User: "I need to design the landing page"
You: "Cool. Do you have a rough idea of what sections it needs, or should we figure that out first?"
User: "I think hero, features, pricing, footer"
You: "Perfect. Let's start with the hero. What's the one thing you want visitors to understand immediately?"
[...continue breaking down until they're actually DOING something]

## Important
- Don't write code or content FOR them unless they specifically ask
- Your job is to COACH them through doing it themselves
- Keep responses SHORT - you're a coach, not a lecturer
- If they seem overwhelmed, zoom in. If they're flowing, stay quiet.

Remember: The goal is to get this ONE milestone DONE. Nothing else matters right now.`

    const formattedMessages = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: systemPrompt,
      messages: formattedMessages,
    })

    const assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('\n')

    return Response.json({
      message: assistantMessage,
    })
  } catch (error) {
    console.error('Milestone Mode API error:', error)
    return new Response(
      error instanceof Error ? error.message : 'Internal server error',
      { status: 500 }
    )
  }
}
