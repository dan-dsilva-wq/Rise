import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { milestone, project } = await req.json()

    if (!milestone?.title) {
      return NextResponse.json({ error: 'Milestone title required' }, { status: 400 })
    }

    const systemPrompt = `You are a productivity coach helping someone break down a milestone into actionable first steps.

Given a milestone and project context, suggest 3-4 specific, actionable first steps.

Respond ONLY with a JSON object in this exact format:
{
  "steps": [
    { "text": "Clear, specific action to take", "type": "action" },
    { "text": "Another step", "type": "action" }
  ]
}

Types:
- "action": A concrete task to do
- "decision": Something to decide or choose
- "research": Information to gather first

Rules:
- Keep steps short and specific (under 100 characters)
- Start with the easiest or most obvious step
- Make steps immediately actionable (no vague "plan" or "think about")
- Focus on what to do RIGHT NOW, not the whole milestone`

    const userMessage = `Milestone: "${milestone.title}"
${milestone.description ? `Description: ${milestone.description}` : ''}
${milestone.notes ? `Notes: ${milestone.notes}` : ''}
Project: ${project?.name || 'Unknown project'}
${project?.description ? `Project context: ${project.description}` : ''}

Generate 3-4 actionable first steps for this milestone.`

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 500,
      messages: [
        { role: 'user', content: userMessage }
      ],
      system: systemPrompt,
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    // Parse the JSON response
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }
      const parsed = JSON.parse(jsonMatch[0])
      return NextResponse.json(parsed)
    } catch {
      console.error('Failed to parse AI response:', content.text)
      // Return default steps
      return NextResponse.json({
        steps: [
          { text: 'Break this down into smaller pieces', type: 'action' },
          { text: 'Identify any blockers or unknowns', type: 'decision' },
          { text: 'Start with the simplest part', type: 'action' },
        ]
      })
    }
  } catch (error) {
    console.error('Milestone steps API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate steps' },
      { status: 500 }
    )
  }
}
