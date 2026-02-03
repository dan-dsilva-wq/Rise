import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchAiContextForApi } from '@/lib/hooks/useAiContext'

let anthropic: Anthropic | null = null
function getAnthropic() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropic
}

interface ProjectWithMilestones {
  id: string
  name: string
  description: string | null
  status: string
  milestones: {
    id: string
    title: string
    status: string
    focus_level: string
  }[]
}

export async function GET(request: NextRequest) {
  try {
    const supabaseClient = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabaseClient as any
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    // Get today's date in user's timezone (default UTC)
    const today = new Date().toISOString().split('T')[0]

    // Check if we already have a briefing for today
    const { data: existingBriefing } = await client
      .from('morning_briefings')
      .select('*')
      .eq('user_id', user.id)
      .eq('briefing_date', today)
      .single()

    if (existingBriefing) {
      // Check if the focus milestone is still valid (not completed/discarded)
      if (existingBriefing.focus_milestone_id) {
        const { data: milestone } = await client
          .from('milestones')
          .select('id, status')
          .eq('id', existingBriefing.focus_milestone_id)
          .single()

        // If milestone is completed or discarded, regenerate the briefing
        if (!milestone || milestone.status === 'completed' || milestone.status === 'discarded') {
          // Delete old briefing and regenerate
          await client
            .from('morning_briefings')
            .delete()
            .eq('id', existingBriefing.id)

          // Fall through to generate new briefing
        } else {
          return Response.json({ briefing: existingBriefing, cached: true })
        }
      } else {
        return Response.json({ briefing: existingBriefing, cached: true })
      }
    }

    // No briefing yet - need to generate one
    // First, get user's projects and milestones
    const { data: projectsData } = await client
      .from('projects')
      .select('id, name, description, status')
      .eq('user_id', user.id)
      .neq('status', 'paused')
      .order('updated_at', { ascending: false })

    const projects = (projectsData || []) as { id: string; name: string; description: string | null; status: string }[]

    if (projects.length === 0) {
      // No projects - return a default briefing
      const defaultBriefing = {
        id: 'default',
        user_id: user.id,
        briefing_date: today,
        mission_summary: "You don't have any active projects yet.",
        nudge: "Head to Path Finder to discover what you should build. The journey to freedom starts with a single step.",
        focus_project_id: null,
        focus_milestone_id: null,
        generated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }
      return Response.json({ briefing: defaultBriefing, cached: false, noProjects: true })
    }

    // Get milestones for each project
    const projectsWithMilestones: ProjectWithMilestones[] = []
    for (const project of projects) {
      const { data: milestonesData } = await client
        .from('milestones')
        .select('id, title, status, focus_level')
        .eq('project_id', project.id)
        .neq('status', 'completed')
        .neq('status', 'discarded')
        .neq('status', 'idea')
        .order('sort_order', { ascending: true })

      const milestones = (milestonesData || []) as { id: string; title: string; status: string; focus_level: string }[]

      projectsWithMilestones.push({
        ...project,
        milestones,
      })
    }

    // Find the active milestone (priority: 'active' focus_level, then first 'next')
    let focusProject: ProjectWithMilestones | null = null
    let focusMilestone: { id: string; title: string } | null = null

    for (const project of projectsWithMilestones) {
      const activeMilestone = project.milestones.find(m => m.focus_level === 'active')
      if (activeMilestone) {
        focusProject = project
        focusMilestone = activeMilestone
        break
      }
    }

    // If no active, find first 'next'
    if (!focusMilestone) {
      for (const project of projectsWithMilestones) {
        const nextMilestone = project.milestones.find(m => m.focus_level === 'next')
        if (nextMilestone) {
          focusProject = project
          focusMilestone = nextMilestone
          break
        }
      }
    }

    // If still nothing, take first milestone from first project
    if (!focusMilestone && projectsWithMilestones[0]?.milestones[0]) {
      focusProject = projectsWithMilestones[0]
      focusMilestone = projectsWithMilestones[0].milestones[0]
    }

    // Fetch AI context bank for personalization
    const aiContext = await fetchAiContextForApi(
      supabaseClient,
      user.id,
      focusProject?.id
    )

    // Build context for AI
    const projectContext = projectsWithMilestones.map(p => {
      const active = p.milestones.find(m => m.focus_level === 'active')
      const next = p.milestones.filter(m => m.focus_level === 'next')
      const backlog = p.milestones.filter(m => m.focus_level === 'backlog' || !m.focus_level)
      const total = p.milestones.length
      const completed = 0 // We excluded completed above

      return `**${p.name}** (${p.status}): ${p.description || 'No description'}
  - Active: ${active ? active.title : 'None'}
  - Up Next: ${next.length > 0 ? next.map(m => m.title).join(', ') : 'None'}
  - Backlog: ${backlog.length} items
  - Total milestones: ${total}`
    }).join('\n\n')

    // Add context bank insights for more personalized briefings
    const contextBankSection = aiContext.fullContext
      ? `\n\n## What We Know About This User\n${aiContext.fullContext}`
      : ''

    // Generate briefing with AI
    if (!process.env.ANTHROPIC_API_KEY) {
      // Fallback if no API key
      const headline = focusMilestone?.title || "Make progress"
      const detail = focusProject ? `Continue working on ${focusProject.name}` : ""
      const fallbackSummary = detail ? `${headline}|||${detail}` : headline

      const { data: savedBriefing } = await client
        .from('morning_briefings')
        .insert({
          user_id: user.id,
          briefing_date: today,
          mission_summary: fallbackSummary,
          nudge: "Small progress is still progress. What's one thing you can do in the next 30 minutes?",
          focus_project_id: focusProject?.id || null,
          focus_milestone_id: focusMilestone?.id || null,
        })
        .select()
        .single()

      return Response.json({ briefing: savedBriefing, cached: false })
    }

    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are a supportive AI cofounder helping someone build their path to freedom. Generate a morning briefing that's:
- Specific to their current projects and milestones
- Encouraging but not cheesy
- Actionable - tells them exactly what to focus on
- Personalized using the context we know about them (their goals, constraints, preferences)

Respond in JSON format:
{
  "mission_headline": "2-5 word summary of today's focus (e.g. 'Build the landing page')",
  "mission_detail": "One sentence with more context about the task",
  "nudge": "A motivating thought specific to where they are in their journey (1-2 sentences) - reference their goals or situation if known"
}`,
      messages: [{
        role: 'user',
        content: `Here's my current project state:\n\n${projectContext}${contextBankSection}\n\nThe suggested focus for today is: ${focusMilestone ? `"${focusMilestone.title}" from project "${focusProject?.name}"` : 'No specific milestone set'}\n\nGenerate my morning briefing.`
      }],
    })

    // Parse AI response
    const aiText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('')

    let briefingContent: { mission_headline: string; mission_detail: string; nudge: string }
    try {
      // Try to parse JSON from response
      const jsonMatch = aiText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        briefingContent = {
          mission_headline: parsed.mission_headline || parsed.mission_summary || focusMilestone?.title || "Make progress",
          mission_detail: parsed.mission_detail || "",
          nudge: parsed.nudge || "Every day you work on this is a day closer to freedom.",
        }
      } else {
        throw new Error('No JSON found')
      }
    } catch {
      // Fallback
      briefingContent = {
        mission_headline: focusMilestone?.title || "Make progress",
        mission_detail: focusProject ? `Continue working on ${focusProject.name}` : "",
        nudge: "Every day you work on this is a day closer to freedom.",
      }
    }

    // Save the briefing (store headline|||detail in mission_summary)
    const missionSummary = briefingContent.mission_detail
      ? `${briefingContent.mission_headline}|||${briefingContent.mission_detail}`
      : briefingContent.mission_headline

    const { data: savedBriefing, error: saveError } = await client
      .from('morning_briefings')
      .insert({
        user_id: user.id,
        briefing_date: today,
        mission_summary: missionSummary,
        nudge: briefingContent.nudge,
        focus_project_id: focusProject?.id || null,
        focus_milestone_id: focusMilestone?.id || null,
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving briefing:', saveError)
      // Return the generated content even if save fails
      return Response.json({
        briefing: {
          id: 'temp',
          user_id: user.id,
          briefing_date: today,
          mission_summary: missionSummary,
          nudge: briefingContent.nudge,
          focus_project_id: focusProject?.id || null,
          focus_milestone_id: focusMilestone?.id || null,
          generated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        cached: false,
        saveError: true,
      })
    }

    return Response.json({ briefing: savedBriefing, cached: false })

  } catch (error) {
    console.error('Morning briefing error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to generate briefing' },
      { status: 500 }
    )
  }
}

// Allow regenerating the briefing
export async function POST(request: NextRequest) {
  try {
    const supabaseClient = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabaseClient as any
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const today = new Date().toISOString().split('T')[0]

    // Delete today's briefing if it exists
    await client
      .from('morning_briefings')
      .delete()
      .eq('user_id', user.id)
      .eq('briefing_date', today)

    // Now call GET to regenerate
    return GET(request)

  } catch (error) {
    console.error('Regenerate briefing error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to regenerate briefing' },
      { status: 500 }
    )
  }
}
