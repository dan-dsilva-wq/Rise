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

interface SuggestedFact {
  category: 'background' | 'skills' | 'situation' | 'goals' | 'preferences' | 'constraints'
  fact: string
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
  newDescription?: string
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

export async function POST(request: NextRequest) {
  try {
    // Check API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set')
      return Response.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const supabaseClient = await createClient()
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { messages, profileContext, existingProjects } = await request.json() as {
      messages: ChatMessage[]
      profileContext?: string
      existingProjects?: ExistingProject[]
    }

    const profileSection = profileContext
      ? `\n\n## What You Already Know About This User\n${profileContext}\n\nUse this information to personalize your responses and avoid asking questions you already know the answer to.`
      : ''

    const projectsSection = existingProjects && existingProjects.length > 0
      ? `\n\n## User's Current Projects\n${existingProjects.map(p =>
          `- **${p.name}** [project_id: ${p.id}] (${p.status}): ${p.description || 'No description'}\n  Milestones (in order):\n${p.milestones.length > 0 ? p.milestones.map((m, i) => `    ${i + 1}. ${m.title} [milestone_id: ${m.id}] (${m.status})`).join('\n') : '    None yet'}`
        ).join('\n')}\n\nYou can add, edit, complete, discard, or reorder milestones. Use the exact IDs shown in brackets.`
      : '\n\n## User\'s Current Projects\nNo projects yet. Once you understand what they want to build, create one for them!'

    const systemPrompt = `You are an expert life coach and business advisor helping someone discover what they should build to achieve freedom. Your goal is to have a deep, thoughtful conversation AND help them make tangible progress by creating/updating projects.
${profileSection}${projectsSection}

## Your Approach
1. **Listen deeply** - Understand their situation
2. **Ask probing questions** - One or two at a time
3. **Be specific** - Don't suggest vague things. Get concrete.
4. **Take action** - Create projects and milestones as you go. Don't wait for permission.

## Key Philosophy
This is NOT just a chat - it's a working session. As soon as you have a reasonable idea of what they want to build, CREATE A PROJECT. You can always refine it later. Users should see tangible progress (projects, milestones) being created as they chat.

## Profile Learning
When the user shares lasting info about themselves, save it:

[PROFILE_UPDATE]
category: <background|skills|situation|goals|preferences|constraints>
fact: <concise fact>
[/PROFILE_UPDATE]

## Project Actions (USE THESE PROACTIVELY!)

### Create a new project (do this as soon as you have a direction!):
[CREATE_PROJECT]
name: <2-5 word project name>
description: <1-2 sentences>
milestone1: <first milestone>
milestone2: <second milestone>
milestone3: <third milestone>
milestone4: <optional>
milestone5: <optional>
[/CREATE_PROJECT]

### Add milestone to existing project:
[ADD_MILESTONE]
project_id: <exact UUID from the [project_id: xxx] shown in projects list>
milestone: <new milestone to add>
[/ADD_MILESTONE]

### Update project status:
[UPDATE_PROJECT]
project_id: <exact UUID from the [project_id: xxx] shown in projects list>
status: <discovery|planning|building|launched|paused>
[/UPDATE_PROJECT]

### Edit an existing milestone:
[EDIT_MILESTONE]
milestone_id: <exact UUID from the [milestone_id: xxx] shown in milestones list>
title: <new title for the milestone>
[/EDIT_MILESTONE]

### Mark milestone as complete:
[COMPLETE_MILESTONE]
milestone_id: <exact UUID from the [milestone_id: xxx] shown in milestones list>
[/COMPLETE_MILESTONE]

### Discard a milestone (keeps data but removes from active list):
[DISCARD_MILESTONE]
milestone_id: <exact UUID from the [milestone_id: xxx] shown in milestones list>
[/DISCARD_MILESTONE]

### Reorder milestones (change the order of milestones):
[REORDER_MILESTONES]
project_id: <exact UUID from the [project_id: xxx] shown in projects list>
order: <comma-separated milestone IDs in new order, e.g. id1,id2,id3>
[/REORDER_MILESTONES]

Use reorder when milestones should logically be done in a different sequence, or when the user asks to reorganize their plan.

## Projects Are Living Documents
Projects should evolve as you learn more. Don't wait for the "perfect" idea - create/update projects as you go:

- **Early in conversation**: If user has no projects, create a discovery project like "Finding My Path" or "Exploring [Topic]"
- **As you learn more**: Update the project name/description to be more specific, or create a new focused project
- **Add milestones freely**: Every concrete step discussed should become a milestone

The user should always have a project to show they're making progress. A project called "Discovering My Direction" with milestones like:
1. Define what freedom means to me
2. Identify my key skills
3. Explore potential paths
4. Choose a direction

...is MUCH better than no project while "just chatting."

## When to Add Milestones
- When discussing next steps for an existing project
- When they mention a new feature or task
- When breaking down a big goal into steps

## Guiding the User
Always be clear about where you're headed:
- "Tell me a bit about your situation and I'll help you figure out what to build"
- "Once I understand your skills and goals, I'll create a project for us to work on together"
- "I'm going to create a project based on what you've told me - we can refine it as we go"
- "I just added that as a milestone to your project"

## Example Flow
User: "I want to build something with AI"
You: "Great! I'll help you find the right AI project. Tell me: what's your background - are you technical, or more on the business/creative side?"
User: "I'm a developer"
You: "Perfect. What problems do you encounter regularly that AI could solve?" [PROFILE_UPDATE for skills]
User: "Maybe helping people write better emails"
You: "I love it - let me create a project for this so we can track our progress..." [CREATE_PROJECT]
"Done! I've created 'AI Email Assistant' with some initial milestones. Now let's refine it - what specific email problems bother you most?"

## First Message Guide
If the user has NO projects yet, your first response should mention:
"I'm here to help you discover and BUILD your path to freedom. As we talk, I'll create a project for you with concrete milestones - so this isn't just a chat, it's real progress."

Remember: Users should feel like they're making progress, not just chatting.`

    const formattedMessages = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    const response = await getAnthropic().messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 1500,
      system: systemPrompt,
      messages: formattedMessages,
    })

    // Extract text from response
    let assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('\n')

    // Parse profile updates from the message
    const suggestedFacts: SuggestedFact[] = []
    const profileUpdateRegex = /\[PROFILE_UPDATE\]\s*category:\s*(\w+)\s*fact:\s*([^\[]+?)\s*\[\/PROFILE_UPDATE\]/g

    let match
    while ((match = profileUpdateRegex.exec(assistantMessage)) !== null) {
      const category = match[1].toLowerCase()
      const fact = match[2].trim()

      if (['background', 'skills', 'situation', 'goals', 'preferences', 'constraints'].includes(category)) {
        suggestedFacts.push({
          category: category as SuggestedFact['category'],
          fact,
        })
      }
    }

    // Parse project actions from the message
    const projectActions: ProjectAction[] = []

    // Parse CREATE_PROJECT
    const createProjectRegex = /\[CREATE_PROJECT\]\s*name:\s*([^\n]+)\s*description:\s*([^\n]+)\s*(milestone1:\s*[^\n]+\s*)?(milestone2:\s*[^\n]+\s*)?(milestone3:\s*[^\n]+\s*)?(milestone4:\s*[^\n]+\s*)?(milestone5:\s*[^\n]+\s*)?\[\/CREATE_PROJECT\]/g
    let createMatch
    while ((createMatch = createProjectRegex.exec(assistantMessage)) !== null) {
      const milestones: string[] = []
      for (let i = 3; i <= 7; i++) {
        if (createMatch[i]) {
          const milestoneText = createMatch[i].replace(/milestone\d:\s*/, '').trim()
          if (milestoneText) {
            milestones.push(milestoneText)
          }
        }
      }
      if (createMatch[1] && createMatch[2]) {
        projectActions.push({
          type: 'create',
          name: createMatch[1].trim(),
          description: createMatch[2].trim(),
          milestones,
        })
      }
    }

    // Parse ADD_MILESTONE
    const addMilestoneRegex = /\[ADD_MILESTONE\]\s*project_id:\s*([^\n]+)\s*milestone:\s*([^\n]+)\s*\[\/ADD_MILESTONE\]/g
    let milestoneMatch
    while ((milestoneMatch = addMilestoneRegex.exec(assistantMessage)) !== null) {
      projectActions.push({
        type: 'add_milestone',
        projectId: milestoneMatch[1].trim(),
        newMilestone: milestoneMatch[2].trim(),
      })
    }

    // Parse UPDATE_PROJECT
    const updateProjectRegex = /\[UPDATE_PROJECT\]\s*project_id:\s*([^\n]+)\s*status:\s*([^\n]+)\s*\[\/UPDATE_PROJECT\]/g
    let updateMatch
    while ((updateMatch = updateProjectRegex.exec(assistantMessage)) !== null) {
      const status = updateMatch[2].trim().toLowerCase()
      if (['discovery', 'planning', 'building', 'launched', 'paused'].includes(status)) {
        projectActions.push({
          type: 'update_status',
          projectId: updateMatch[1].trim(),
          newStatus: status as ProjectAction['newStatus'],
        })
      }
    }

    // Parse EDIT_MILESTONE
    const editMilestoneRegex = /\[EDIT_MILESTONE\]\s*milestone_id:\s*([^\n]+)\s*title:\s*([^\n]+)\s*\[\/EDIT_MILESTONE\]/g
    let editMilestoneMatch
    while ((editMilestoneMatch = editMilestoneRegex.exec(assistantMessage)) !== null) {
      projectActions.push({
        type: 'edit_milestone',
        milestoneId: editMilestoneMatch[1].trim(),
        newTitle: editMilestoneMatch[2].trim(),
      })
    }

    // Parse COMPLETE_MILESTONE
    const completeMilestoneRegex = /\[COMPLETE_MILESTONE\]\s*milestone_id:\s*([^\n]+)\s*\[\/COMPLETE_MILESTONE\]/g
    let completeMilestoneMatch
    while ((completeMilestoneMatch = completeMilestoneRegex.exec(assistantMessage)) !== null) {
      projectActions.push({
        type: 'complete_milestone',
        milestoneId: completeMilestoneMatch[1].trim(),
      })
    }

    // Parse DISCARD_MILESTONE
    const discardMilestoneRegex = /\[DISCARD_MILESTONE\]\s*milestone_id:\s*([^\n]+)\s*\[\/DISCARD_MILESTONE\]/g
    let discardMilestoneMatch
    while ((discardMilestoneMatch = discardMilestoneRegex.exec(assistantMessage)) !== null) {
      projectActions.push({
        type: 'discard_milestone',
        milestoneId: discardMilestoneMatch[1].trim(),
      })
    }

    // Parse REORDER_MILESTONES
    const reorderMilestonesRegex = /\[REORDER_MILESTONES\]\s*project_id:\s*([^\n]+)\s*order:\s*([^\n]+)\s*\[\/REORDER_MILESTONES\]/g
    let reorderMatch
    while ((reorderMatch = reorderMilestonesRegex.exec(assistantMessage)) !== null) {
      const orderStr = reorderMatch[2].trim()
      const milestoneOrder = orderStr.split(',').map(id => id.trim()).filter(id => id.length > 0)
      if (milestoneOrder.length > 0) {
        projectActions.push({
          type: 'reorder_milestones',
          projectId: reorderMatch[1].trim(),
          milestoneOrder,
        })
      }
    }

    // Also support old PROJECT_SUGGESTION format for backwards compatibility
    const oldProjectRegex = /\[PROJECT_SUGGESTION\]\s*name:\s*([^\n]+)\s*description:\s*([^\n]+)\s*(milestone1:\s*[^\n]+\s*)?(milestone2:\s*[^\n]+\s*)?(milestone3:\s*[^\n]+\s*)?(milestone4:\s*[^\n]+\s*)?(milestone5:\s*[^\n]+\s*)?\[\/PROJECT_SUGGESTION\]/g
    let oldMatch
    while ((oldMatch = oldProjectRegex.exec(assistantMessage)) !== null) {
      const milestones: string[] = []
      for (let i = 3; i <= 7; i++) {
        if (oldMatch[i]) {
          const milestoneText = oldMatch[i].replace(/milestone\d:\s*/, '').trim()
          if (milestoneText) {
            milestones.push(milestoneText)
          }
        }
      }
      if (oldMatch[1] && oldMatch[2]) {
        projectActions.push({
          type: 'create',
          name: oldMatch[1].trim(),
          description: oldMatch[2].trim(),
          milestones,
        })
      }
    }

    // Remove all structured tags from the visible message
    assistantMessage = assistantMessage
      .replace(/\[PROFILE_UPDATE\][\s\S]*?\[\/PROFILE_UPDATE\]/g, '')
      .replace(/\[CREATE_PROJECT\][\s\S]*?\[\/CREATE_PROJECT\]/g, '')
      .replace(/\[ADD_MILESTONE\][\s\S]*?\[\/ADD_MILESTONE\]/g, '')
      .replace(/\[UPDATE_PROJECT\][\s\S]*?\[\/UPDATE_PROJECT\]/g, '')
      .replace(/\[EDIT_MILESTONE\][\s\S]*?\[\/EDIT_MILESTONE\]/g, '')
      .replace(/\[COMPLETE_MILESTONE\][\s\S]*?\[\/COMPLETE_MILESTONE\]/g, '')
      .replace(/\[DISCARD_MILESTONE\][\s\S]*?\[\/DISCARD_MILESTONE\]/g, '')
      .replace(/\[REORDER_MILESTONES\][\s\S]*?\[\/REORDER_MILESTONES\]/g, '')
      .replace(/\[PROJECT_SUGGESTION\][\s\S]*?\[\/PROJECT_SUGGESTION\]/g, '')
      .trim()

    return Response.json({
      message: assistantMessage,
      suggestedFacts: suggestedFacts.length > 0 ? suggestedFacts : undefined,
      projectActions: projectActions.length > 0 ? projectActions : undefined,
    })
  } catch (error) {
    console.error('Path Finder API error:', error)
    return new Response(
      error instanceof Error ? error.message : 'Internal server error',
      { status: 500 }
    )
  }
}
