import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchAiContextForApi, saveAiInsight } from '@/lib/hooks/aiContextServer'
import { weaveMemory } from '@/lib/ai/memoryWeaver'
import type { InsightType } from '@/lib/supabase/types'

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

interface ProjectContextInput {
  id: string
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
  currentStep?: {
    text: string
    stepNumber: number
    totalSteps: number
    completedSteps: number
  }
}

// Helper to parse insight tags from AI response
function parseInsightTags(message: string): Array<{ type: InsightType; content: string; importance: number }> {
  const insights: Array<{ type: InsightType; content: string; importance: number }> = []
  const insightRegex = /\[INSIGHT\]\s*type:\s*(\w+)\s*content:\s*([^\n]+)\s*(?:importance:\s*(\d+)\s*)?\[\/INSIGHT\]/gi

  let match
  while ((match = insightRegex.exec(message)) !== null) {
    const type = match[1].toLowerCase() as InsightType
    const content = match[2].trim()
    const importance = match[3] ? parseInt(match[3], 10) : 5

    if (['discovery', 'decision', 'blocker', 'preference', 'learning'].includes(type) && content) {
      insights.push({ type, content, importance })
    }
  }

  return insights
}

// Generate dynamic expert persona based on ALL available context
function generateExpertise(
  milestoneTitle: string,
  milestoneDescription: string | null,
  projectName: string,
  projectDescription: string | null,
  contextBank: string
): string {
  // Combine all context for analysis
  const allContext = `
Project: ${projectName}
Project Description: ${projectDescription || 'Not specified'}
Current Milestone: ${milestoneTitle}
Milestone Description: ${milestoneDescription || 'Not specified'}
Known Context: ${contextBank || 'None yet'}
`.trim()

  // Dynamic prompt that generates the expert identity
  return `Based on this context, YOU determine what kind of expert you should be:

${allContext}

INSTRUCTIONS FOR DETERMINING YOUR EXPERT IDENTITY:
1. Analyze the milestone title and description to understand what TYPE of work this is
2. Analyze the project to understand the DOMAIN/INDUSTRY
3. Become the EXACT specialist needed for this specific task

For example:
- "Design the landing page" for a fitness app → You're a UI/UX Designer who specializes in fitness/health apps
- "Set up Supabase database" for a SaaS → You're a Backend Engineer expert in PostgreSQL and SaaS architecture
- "Write launch email sequence" for an e-commerce store → You're an Email Marketing Specialist in e-commerce
- "Interview potential customers" for any project → You're a User Research Expert
- "Create pricing strategy" for a B2B tool → You're a B2B Pricing Strategist

BE SPECIFIC to this exact milestone and project. Don't be a generalist - be the precise expert they need RIGHT NOW.

In your first response, briefly introduce your expertise (1 sentence) so the user knows they're talking to the right specialist, then dive into helping them.`
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

    const { messages, milestone, project, approach } = await request.json() as {
      messages: ChatMessage[]
      milestone: MilestoneContext
      project: ProjectContextInput
      approach?: 'do-it' | 'guide'
    }

    // Fetch AI context bank and unified memory in parallel
    const [aiContext, wovenMemory] = await Promise.all([
      fetchAiContextForApi(
        supabaseClient,
        user.id,
        project.id,
        milestone.id
      ),
      weaveMemory(supabaseClient, user.id, {
        currentSource: 'milestone_mode',
        projectId: project.id,
        maxPerSource: 12,
        lookbackDays: 7,
      }),
    ])

    // Build context about the project and where this milestone fits
    const completedCount = project.milestones.filter(m => m.status === 'completed').length
    const totalCount = project.milestones.length
    const currentIndex = project.milestones.findIndex(m => m.id === milestone.id) + 1

    // Build context bank section if we have data
    const contextBankSection = aiContext.fullContext
      ? `\n\n## Context Bank (What We Already Know)\n${aiContext.fullContext}\n\nUSE THIS CONTEXT! Don't ask questions you already know the answer to.`
      : ''

    // Add unified memory for cross-conversation awareness
    const memorySection = wovenMemory.contextBlock
      ? `\n\n${wovenMemory.contextBlock}`
      : ''

    const projectOverview = `
## Project Overview
**${project.name}** - ${project.description || 'No description'}
Status: ${project.status}
Progress: ${completedCount}/${totalCount} milestones complete

## All Milestones
${project.milestones.map((m, i) =>
  `${i + 1}. ${m.title} [${m.status}]${m.id === milestone.id ? ' <-- CURRENT' : ''}`
).join('\n')}
${contextBankSection}${memorySection}`

    // Generate dynamic expertise instructions
    const expertiseInstructions = generateExpertise(
      milestone.title,
      milestone.description,
      project.name,
      project.description,
      aiContext.fullContext || ''
    )

    // Different system prompts based on approach
    const doItForMePrompt = `You are Rise - a SPECIALIST who DOES THE WORK for the user. You're not a generalist - you're the exact expert they need for this specific task. You are ONE unified mind that remembers ALL conversations with this user. When past conversations are relevant, weave them in naturally ("I remember you mentioned...", "Building on what we discussed..."). Don't force cross-references - only use them when genuinely helpful.

## Determine Your Expert Identity
${expertiseInstructions}

${projectOverview}

## Current Milestone (Your ONLY Focus)
**${milestone.title}**
${milestone.description ? `Description: ${milestone.description}` : ''}
This is milestone ${currentIndex} of ${totalCount}.
${milestone.currentStep ? `
## Current Step They're Working On
**Step ${milestone.currentStep.stepNumber}/${milestone.currentStep.totalSteps}: "${milestone.currentStep.text}"**
Progress: ${milestone.currentStep.completedSteps} of ${milestone.currentStep.totalSteps} steps complete

IMPORTANT: Focus your help on THIS specific step. They've already completed ${milestone.currentStep.completedSteps} previous steps.
` : ''}
## Your Role - DO IT FOR THEM
The user chose "Do it for me" mode. They want you to:
- **Write code** - Give them complete, working code they can copy-paste
- **Write content** - Draft full copy, emails, documentation, etc.
- **Create plans** - Detailed step-by-step plans with specifics
- **Solve problems** - Give direct solutions, not questions

## Your Approach
1. **Ask clarifying questions ONCE** - Get what you need to do the work
2. **Then DO the work** - Provide complete, ready-to-use output
3. **Be thorough** - Don't make them ask follow-up questions
4. **Format for easy use** - Code in code blocks, content ready to copy

## Conversation Style
- Start by asking what specifically they need done
- After they answer, DELIVER the full solution
- Use code blocks for code, clear formatting for content
- If the task is big, break it into parts but complete each part fully

## Example Flow
User: "I need to design the landing page"
You: "Got it! What's the product/service, and what action do you want visitors to take?"
User: "It's a fitness app, I want them to sign up for the waitlist"
You: "Here's a complete landing page structure with copy:

**Hero Section**
Headline: 'Get Fit on Your Schedule'
Subheadline: 'AI-powered workouts that adapt to your life. Join 10,000+ on the waitlist.'
CTA Button: 'Join the Waitlist'

**Features Section**
[... complete detailed copy for all sections ...]

Want me to write the actual HTML/React code for this?"

## Important
- You ARE here to do the work, not just coach
- Provide COMPLETE solutions they can use immediately
- Ask minimal questions, maximize output
- If you can do it, do it. Don't ask "would you like me to..."
- USE THE CONTEXT BANK above - don't ask about things we already know (tech stack, audience, etc.)

## Learning New Things
When you discover something new about the user or project (blockers, preferences, decisions), save it:

[INSIGHT]
type: <discovery|decision|blocker|preference|learning>
content: <what was learned>
importance: <1-10>
[/INSIGHT]

Examples:
- User says they're not comfortable with TypeScript → type: blocker, content: User uncomfortable with TypeScript, prefers JavaScript, importance: 7
- User chooses a specific approach → type: decision, content: Decided to use Tailwind CSS for styling, importance: 6

Remember: They chose "Do it for me" because they want results, not guidance.`

    const guideMePrompt = `You are Rise - a SPECIALIST acting as a tactical coach, helping someone complete ONE specific milestone. You're not a generalist - you're the exact expert they need, guiding them like a mentor saying "Here's how the pros do it." You are ONE unified mind that remembers ALL conversations with this user. Reference past conversations naturally when relevant ("Remember when you said...", "This connects to your earlier insight about...").

## Determine Your Expert Identity
${expertiseInstructions}

${projectOverview}

## Current Milestone (Your ONLY Focus)
**${milestone.title}**
${milestone.description ? `Description: ${milestone.description}` : ''}
This is milestone ${currentIndex} of ${totalCount}.
${milestone.currentStep ? `
## Current Step They're Working On
**Step ${milestone.currentStep.stepNumber}/${milestone.currentStep.totalSteps}: "${milestone.currentStep.text}"**
Progress: ${milestone.currentStep.completedSteps} of ${milestone.currentStep.totalSteps} steps complete

IMPORTANT: Guide them through THIS specific step. They've already completed ${milestone.currentStep.completedSteps} previous steps.
` : ''}
## Your Role - GUIDE THEM
The user chose "Guide me" mode. They want to LEARN and DO it themselves with your coaching.
You are NOT here to do the work for them - you're here to help them do it.

## Your Approach
1. **Break it down** - What's the absolute smallest next action?
2. **Remove blockers** - "What's stopping you?" then help solve it
3. **Keep momentum** - One tiny step at a time
4. **Teach concepts** - Explain the WHY so they learn
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

## Example Flow
User: "I need to design the landing page"
You: "Cool. Do you have a rough idea of what sections it needs, or should we figure that out first?"
User: "I think hero, features, pricing, footer"
You: "Perfect. Let's start with the hero. What's the one thing you want visitors to understand immediately?"
[...continue breaking down until they're actually DOING something]

## Important
- Don't write code or content FOR them unless they're completely stuck
- Your job is to COACH them through doing it themselves
- Keep responses SHORT - you're a coach, not a lecturer
- Help them learn, not just get the answer
- USE THE CONTEXT BANK above - reference what we already know to personalize guidance

## Learning New Things
When you discover something new about the user (blockers, preferences, how they learn best), save it:

[INSIGHT]
type: <discovery|decision|blocker|preference|learning>
content: <what was learned>
importance: <1-10>
[/INSIGHT]

Examples:
- User seems to learn better with visual examples → type: preference, content: Learns better with visual examples and diagrams, importance: 6
- User is blocked on understanding a concept → type: blocker, content: Struggling to understand async/await patterns, importance: 7

Remember: They chose "Guide me" because they want to learn and grow.`

    const systemPrompt = approach === 'do-it' ? doItForMePrompt : guideMePrompt

    const formattedMessages = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    const response = await getAnthropic().messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 2000, // Increased for expert-level detailed responses
      system: systemPrompt,
      messages: formattedMessages,
    })

    let assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('\n')

    // Parse and save any insights from the response
    const extractedInsights = parseInsightTags(assistantMessage)
    if (extractedInsights.length > 0) {
      Promise.all(
        extractedInsights.map(insight =>
          saveAiInsight(
            supabaseClient,
            user.id,
            insight.type,
            insight.content,
            'milestone_mode',
            {
              projectId: project.id,
              milestoneId: milestone.id,
              importance: insight.importance,
            }
          )
        )
      ).catch(err => console.error('Error saving milestone mode insights:', err))
    }

    // Remove insight tags from visible message
    assistantMessage = assistantMessage
      .replace(/\[INSIGHT\][\s\S]*?\[\/INSIGHT\]/gi, '')
      .trim()

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
