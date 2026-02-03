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
  type: 'create' | 'add_milestone' | 'add_idea' | 'add_note' | 'promote_idea' | 'set_focus' | 'update_status' | 'edit_milestone' | 'complete_milestone' | 'discard_milestone' | 'reorder_milestones'
  projectId?: string
  milestoneId?: string
  name?: string
  description?: string
  milestones?: string[]
  newMilestone?: string
  newIdea?: string
  newNote?: string
  newTitle?: string
  newDescription?: string
  newStatus?: 'discovery' | 'planning' | 'building' | 'launched' | 'paused'
  focusLevel?: 'active' | 'next' | 'backlog'
  milestoneOrder?: string[] // Array of milestone IDs in new order
}

interface ExistingProject {
  id: string
  name: string
  description: string | null
  status: string
  milestones: { id: string; title: string; status: string; sort_order: number; notes: string | null; focus_level: string }[]
  ideas: { id: string; title: string; notes: string | null }[]
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
      ? `\n\n## User's Current Projects\n${existingProjects.map(p => {
          const active = p.milestones.filter(m => m.focus_level === 'active')
          const upNext = p.milestones.filter(m => m.focus_level === 'next')
          const backlog = p.milestones.filter(m => m.focus_level === 'backlog' || !m.focus_level)

          const activeStr = active.length > 0
            ? `  🎯 ACTIVE: ${active[0].title} [milestone_id: ${active[0].id}]`
            : '  🎯 ACTIVE: None set'
          const nextStr = upNext.length > 0
            ? `\n  ⏳ UP NEXT (${upNext.length}/3):\n${upNext.map(m => `    - ${m.title} [milestone_id: ${m.id}]`).join('\n')}`
            : ''
          const backlogStr = backlog.length > 0
            ? `\n  📋 BACKLOG (${backlog.length}):\n${backlog.map(m => `    - ${m.title} [milestone_id: ${m.id}]`).join('\n')}`
            : ''
          const ideasStr = p.ideas && p.ideas.length > 0
            ? `\n  💡 IDEAS (${p.ideas.length}):\n${p.ideas.map(idea => `    - ${idea.title} [idea_id: ${idea.id}]`).join('\n')}`
            : ''
          return `- **${p.name}** [project_id: ${p.id}] (${p.status}): ${p.description || 'No description'}\n${activeStr}${nextStr}${backlogStr}${ideasStr}`
        }).join('\n\n')}\n\nManage focus with SET_FOCUS. Only 1 active, max 3 up next.`
      : '\n\n## User\'s Current Projects\nNo projects yet. Once you understand what they want to build, create one for them!'

    const systemPrompt = `You are an expert life coach and business advisor helping someone discover what they should build to achieve freedom. Your goal is to have a deep, thoughtful conversation AND help them make tangible progress by creating/updating projects.
${profileSection}${projectsSection}

## Your Approach
1. **Listen deeply** - Understand their situation
2. **Ask probing questions** - One or two at a time
3. **Be specific** - Don't suggest vague things. Get concrete.
4. **Take action** - Create projects, milestones, and ideas as you go. Use your judgment.

## Key Philosophy: Ideas vs Milestones
**Milestones** = Committed work. Clear next steps the user will actually do.
**Ideas** = Brainstorming. Possibilities to explore later. No pressure.

Use your initiative to decide what something is:
- Sounds like a concrete next step? → Add as MILESTONE
- Just exploring/brainstorming? → Add as IDEA
- Clarifies an existing milestone? → Add as NOTE to that milestone
- User refining something? → EDIT the milestone

This keeps their active milestone list focused while still capturing every thought.

## Profile Learning
When the user shares lasting info about themselves, save it:

[PROFILE_UPDATE]
category: <background|skills|situation|goals|preferences|constraints>
fact: <concise fact>
[/PROFILE_UPDATE]

## Project Actions (USE THESE PROACTIVELY!)

**CRITICAL: You MUST include the actual tags in your response to make changes happen. Simply saying "I'll add that" or "Done!" does NOTHING - the system only acts when it sees the actual [TAG] blocks. Always include the full tag block when taking action.**

### Create a new project:
[CREATE_PROJECT]
name: <2-5 word project name>
description: <1-2 sentences>
milestone1: <first milestone>
milestone2: <second milestone>
milestone3: <third milestone>
milestone4: <optional>
milestone5: <optional>
[/CREATE_PROJECT]

### Add a MILESTONE (committed next step):
[ADD_MILESTONE]
project_id: <exact UUID>
milestone: <clear, actionable step>
[/ADD_MILESTONE]

### Add an IDEA (brainstorming, future possibility):
[ADD_IDEA]
project_id: <exact UUID>
idea: <the idea or possibility>
[/ADD_IDEA]

### Add a NOTE to an existing milestone or idea (extra context/details):
[ADD_NOTE]
milestone_id: <exact UUID from milestone_id or idea_id>
note: <additional context or detail>
[/ADD_NOTE]

### Promote an idea to active milestone (user decides to commit):
[PROMOTE_IDEA]
idea_id: <exact UUID from idea_id>
[/PROMOTE_IDEA]

### Update project status:
[UPDATE_PROJECT]
project_id: <exact UUID>
status: <discovery|planning|building|launched|paused>
[/UPDATE_PROJECT]

### Edit an existing milestone/idea title:
[EDIT_MILESTONE]
milestone_id: <exact UUID>
title: <new title>
[/EDIT_MILESTONE]

### Mark milestone as complete:
[COMPLETE_MILESTONE]
milestone_id: <exact UUID>
[/COMPLETE_MILESTONE]

### Discard a milestone/idea:
[DISCARD_MILESTONE]
milestone_id: <exact UUID>
[/DISCARD_MILESTONE]

### Reorder milestones:
[REORDER_MILESTONES]
project_id: <exact UUID>
order: <comma-separated milestone IDs in new order>
[/REORDER_MILESTONES]

### Set milestone focus level (IMPORTANT - use this to organize!):
[SET_FOCUS]
milestone_id: <exact UUID>
level: <active|next|backlog>
[/SET_FOCUS]

Focus levels:
- **active**: The ONE thing to work on now. Only 1 allowed per project.
- **next**: Up to 3 items ready when active is done.
- **backlog**: Everything else, out of sight.

When organizing milestones, USE SET_FOCUS to move items between levels. The system auto-assigns smart defaults when creating milestones, but you should reorganize when the user:
- Wants to prioritize something different
- Completes active work and needs a new focus
- Has too many items in "next" and needs to trim
- Seems overwhelmed (move things to backlog, pick ONE active)

## Decision Guide: What Action to Take?

| User says... | You do... |
|--------------|-----------|
| "I need to build X" | ADD_MILESTONE (auto-assigns to active/next) |
| "Maybe I could try X" | ADD_IDEA |
| "What about X?" (exploring) | ADD_IDEA |
| "For that milestone, I should also..." | ADD_NOTE to that milestone |
| "Actually, change that to..." | EDIT_MILESTONE |
| "Let's do that idea" | PROMOTE_IDEA + SET_FOCUS |
| "Never mind about X" | DISCARD_MILESTONE |
| "I'll work on X first" | SET_FOCUS to active |
| "X should be next" | SET_FOCUS to next |
| "Put X aside for now" | SET_FOCUS to backlog |
| User seems overwhelmed | Organize with SET_FOCUS - pick 1 active, 2-3 next |

## Projects Are Living Documents
- Create projects early, refine as you go
- Keep active milestones focused (3-7 is ideal)
- Use ideas liberally for brainstorming
- The user should feel organized, not overwhelmed

## Guiding the User
- "I'm adding that as an idea for now - you can promote it to an active milestone when ready"
- "That sounds like a clear next step - adding it as a milestone"
- "I'm noting that on your existing milestone so you don't forget"

Remember: Users should feel like they're making progress AND staying organized.`

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

    // Parse ADD_IDEA
    const addIdeaRegex = /\[ADD_IDEA\]\s*project_id:\s*([^\n]+)\s*idea:\s*([^\n]+)\s*\[\/ADD_IDEA\]/g
    let ideaMatch
    while ((ideaMatch = addIdeaRegex.exec(assistantMessage)) !== null) {
      projectActions.push({
        type: 'add_idea',
        projectId: ideaMatch[1].trim(),
        newIdea: ideaMatch[2].trim(),
      })
    }

    // Parse ADD_NOTE
    const addNoteRegex = /\[ADD_NOTE\]\s*milestone_id:\s*([^\n]+)\s*note:\s*([^\n]+)\s*\[\/ADD_NOTE\]/g
    let noteMatch
    while ((noteMatch = addNoteRegex.exec(assistantMessage)) !== null) {
      projectActions.push({
        type: 'add_note',
        milestoneId: noteMatch[1].trim(),
        newNote: noteMatch[2].trim(),
      })
    }

    // Parse PROMOTE_IDEA
    const promoteIdeaRegex = /\[PROMOTE_IDEA\]\s*idea_id:\s*([^\n]+)\s*\[\/PROMOTE_IDEA\]/g
    let promoteMatch
    while ((promoteMatch = promoteIdeaRegex.exec(assistantMessage)) !== null) {
      projectActions.push({
        type: 'promote_idea',
        milestoneId: promoteMatch[1].trim(),
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

    // Parse SET_FOCUS
    const setFocusRegex = /\[SET_FOCUS\]\s*milestone_id:\s*([^\n]+)\s*level:\s*([^\n]+)\s*\[\/SET_FOCUS\]/g
    let focusMatch
    while ((focusMatch = setFocusRegex.exec(assistantMessage)) !== null) {
      const level = focusMatch[2].trim().toLowerCase()
      if (['active', 'next', 'backlog'].includes(level)) {
        projectActions.push({
          type: 'set_focus',
          milestoneId: focusMatch[1].trim(),
          focusLevel: level as 'active' | 'next' | 'backlog',
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
      .replace(/\[ADD_IDEA\][\s\S]*?\[\/ADD_IDEA\]/g, '')
      .replace(/\[ADD_NOTE\][\s\S]*?\[\/ADD_NOTE\]/g, '')
      .replace(/\[PROMOTE_IDEA\][\s\S]*?\[\/PROMOTE_IDEA\]/g, '')
      .replace(/\[SET_FOCUS\][\s\S]*?\[\/SET_FOCUS\]/g, '')
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
