import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchAiContextForApi } from '@/lib/hooks/aiContextServer'
import { weaveMemory, generatePersonalGreeting } from '@/lib/ai/memoryWeaver'

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

interface CurrentStepInfo {
  stepId: string
  stepText: string
  stepNumber: number
  totalSteps: number
  completedSteps: number
}

// Helper function to fetch current step for a milestone
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCurrentStep(client: any, milestoneId: string, userId: string): Promise<CurrentStepInfo | null> {
  try {
    const { data: steps } = await client
      .from('milestone_steps')
      .select('id, text, is_completed, sort_order')
      .eq('milestone_id', milestoneId)
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })

    if (!steps || steps.length === 0) {
      return null
    }

    const typedSteps = steps as { id: string; text: string; is_completed: boolean; sort_order: number }[]
    const completedSteps = typedSteps.filter(s => s.is_completed).length
    const currentStep = typedSteps.find(s => !s.is_completed)

    if (!currentStep) {
      // All steps complete
      return {
        stepId: typedSteps[typedSteps.length - 1].id,
        stepText: typedSteps[typedSteps.length - 1].text,
        stepNumber: typedSteps.length,
        totalSteps: typedSteps.length,
        completedSteps,
      }
    }

    const stepNumber = typedSteps.findIndex(s => s.id === currentStep.id) + 1

    return {
      stepId: currentStep.id,
      stepText: currentStep.text,
      stepNumber,
      totalSteps: typedSteps.length,
      completedSteps,
    }
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
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
          // Fetch current step + personal greeting for cached briefings
          const [currentStep, cachedLogsResult, cachedProfileResult, cachedCompletionResult] = await Promise.all([
            fetchCurrentStep(client, existingBriefing.focus_milestone_id, user.id),
            client.from('daily_logs')
              .select('log_date, morning_mood, morning_energy, evening_mood, evening_energy, day_rating, gratitude_entry')
              .eq('user_id', user.id)
              .order('log_date', { ascending: false })
              .limit(5),
            client.from('profiles')
              .select('display_name')
              .eq('id', user.id)
              .single(),
            client.from('milestones')
              .select('title, completed_at')
              .eq('user_id', user.id)
              .eq('status', 'completed')
              .order('completed_at', { ascending: false })
              .limit(1),
          ])
          const cachedLogs = (cachedLogsResult.data || []) as Array<{
            log_date: string; morning_mood: number | null; morning_energy: number | null
            evening_mood: number | null; evening_energy: number | null; day_rating: number | null
            gratitude_entry: string | null
          }>
          const cachedCompletion = (cachedCompletionResult.data || [])[0] as { title: string; completed_at: string } | undefined
          const cachedMilestoneTitle = cachedCompletion?.completed_at
            && (Date.now() - new Date(cachedCompletion.completed_at).getTime()) < 2 * 24 * 60 * 60 * 1000
            ? cachedCompletion.title : null
          const cachedGreeting = generatePersonalGreeting(
            cachedLogs, cachedProfileResult.data?.display_name || null, cachedMilestoneTitle,
          )
          return Response.json({ briefing: existingBriefing, cached: true, currentStep, personalGreeting: cachedGreeting })
        }
      } else {
        // No focus milestone — still generate a greeting
        const [cachedLogsResult, cachedProfileResult] = await Promise.all([
          client.from('daily_logs')
            .select('log_date, morning_mood, morning_energy, evening_mood, evening_energy, day_rating, gratitude_entry')
            .eq('user_id', user.id)
            .order('log_date', { ascending: false })
            .limit(5),
          client.from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .single(),
        ])
        const cachedLogs = (cachedLogsResult.data || []) as Array<{
          log_date: string; morning_mood: number | null; morning_energy: number | null
          evening_mood: number | null; evening_energy: number | null; day_rating: number | null
          gratitude_entry: string | null
        }>
        const cachedGreeting = generatePersonalGreeting(
          cachedLogs, cachedProfileResult.data?.display_name || null,
        )
        return Response.json({ briefing: existingBriefing, cached: true, personalGreeting: cachedGreeting })
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
      // No projects - generate a simple greeting and return a default briefing
      const [noProjectLogsResult, noProjectProfileResult] = await Promise.all([
        client.from('daily_logs')
          .select('log_date, morning_mood, morning_energy, evening_mood, evening_energy, day_rating, gratitude_entry')
          .eq('user_id', user.id).order('log_date', { ascending: false }).limit(5),
        client.from('profiles').select('display_name').eq('id', user.id).single(),
      ])
      const noProjectLogs = (noProjectLogsResult.data || []) as Array<{
        log_date: string; morning_mood: number | null; morning_energy: number | null
        evening_mood: number | null; evening_energy: number | null; day_rating: number | null
        gratitude_entry: string | null
      }>
      const noProjectGreeting = generatePersonalGreeting(
        noProjectLogs, noProjectProfileResult.data?.display_name || null, null, noProjectLogs.length,
      )
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
      return Response.json({ briefing: defaultBriefing, cached: false, noProjects: true, personalGreeting: noProjectGreeting })
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

    // Fetch AI context bank, unified memory, and recent daily logs for personalization
    const [aiContext, wovenMemory, recentLogsResult, recentCompletionResult] = await Promise.all([
      fetchAiContextForApi(
        supabaseClient,
        user.id,
        focusProject?.id
      ),
      weaveMemory(supabaseClient, user.id, {
        currentSource: 'morning_briefing',
        projectId: focusProject?.id,
        maxPerSource: 15,
        lookbackDays: 3,
      }),
      // Recent daily logs for personal greeting
      client
        .from('daily_logs')
        .select('log_date, morning_mood, morning_energy, evening_mood, evening_energy, day_rating, gratitude_entry')
        .eq('user_id', user.id)
        .order('log_date', { ascending: false })
        .limit(5),
      // Most recently completed milestone for greeting context
      client
        .from('milestones')
        .select('title, completed_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1),
    ])

    const recentLogs = (recentLogsResult.data || []) as Array<{
      log_date: string
      morning_mood: number | null
      morning_energy: number | null
      evening_mood: number | null
      evening_energy: number | null
      day_rating: number | null
      gratitude_entry: string | null
    }>

    const recentCompletion = (recentCompletionResult.data || [])[0] as { title: string; completed_at: string } | undefined

    // Check if completion was within the last 2 days
    const recentMilestoneTitle = recentCompletion?.completed_at
      && (Date.now() - new Date(recentCompletion.completed_at).getTime()) < 2 * 24 * 60 * 60 * 1000
      ? recentCompletion.title
      : null

    // Generate a fast personal greeting from data (no AI needed)
    const { data: profileData } = await client
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()

    const personalGreeting = generatePersonalGreeting(
      recentLogs,
      profileData?.display_name || null,
      recentMilestoneTitle,
    )

    // Build context for AI
    const projectContext = projectsWithMilestones.map(p => {
      const active = p.milestones.find(m => m.focus_level === 'active')
      const next = p.milestones.filter(m => m.focus_level === 'next')
      const backlog = p.milestones.filter(m => m.focus_level === 'backlog' || !m.focus_level)
      const total = p.milestones.length
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

    // Add unified memory for cross-conversation awareness
    const memorySection = wovenMemory.contextBlock
      ? `\n\n${wovenMemory.contextBlock}`
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

      // Fetch current step info if we have a focus milestone
      const currentStep = focusMilestone?.id
        ? await fetchCurrentStep(client, focusMilestone.id, user.id)
        : null

      return Response.json({ briefing: savedBriefing, cached: false, currentStep, personalGreeting })
    }

    const response = await getAnthropic().messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 500,
      system: `You are Rise - a supportive AI cofounder helping someone build their path to freedom. You are ONE mind that remembers all conversations with this user. Generate a morning briefing that's:
- Specific to their current projects and milestones
- Encouraging but not cheesy
- Actionable - tells them exactly what to focus on
- Personalized using the context we know about them (their goals, constraints, preferences)
- References recent conversations naturally (e.g. "Yesterday you were working on..." or "You mentioned wanting to...")
- Acknowledges their emotional state if known

Respond in JSON format:
{
  "mission_headline": "2-5 word summary of today's focus (e.g. 'Build the landing page')",
  "mission_detail": "One sentence with more context about the task - reference recent conversations or decisions if relevant",
  "nudge": "A motivating thought specific to where they are in their journey (1-2 sentences) - reference their recent conversations, emotional state, or open loops",
  "personal_greeting": "A warm, personal 1-sentence greeting that acknowledges how they're doing emotionally or references something specific from recent days. This should feel like a friend who's been paying attention — NOT a task manager. Examples: 'You turned yesterday around — I noticed your mood lifted by evening.', 'Three days in a row now. That quiet consistency is building something.', 'I saw your gratitude entry last night — that kind of awareness compounds.'"
}`,
      messages: [{
        role: 'user',
        content: `Here's my current project state:\n\n${projectContext}${contextBankSection}${memorySection}\n\nThe suggested focus for today is: ${focusMilestone ? `"${focusMilestone.title}" from project "${focusProject?.name}"` : 'No specific milestone set'}\n\nGenerate my morning briefing.`
      }],
    })

    // Parse AI response
    const aiText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('')

    let briefingContent: { mission_headline: string; mission_detail: string; nudge: string; personal_greeting?: string }
    try {
      // Try to parse JSON from response
      const jsonMatch = aiText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        briefingContent = {
          mission_headline: parsed.mission_headline || parsed.mission_summary || focusMilestone?.title || "Make progress",
          mission_detail: parsed.mission_detail || "",
          nudge: parsed.nudge || "Every day you work on this is a day closer to freedom.",
          personal_greeting: parsed.personal_greeting || undefined,
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

    // Use AI-generated greeting if available, otherwise fall back to data-based one
    const finalGreeting = briefingContent.personal_greeting || personalGreeting

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

    // Fetch current step info if we have a focus milestone
    const currentStep = focusMilestone?.id
      ? await fetchCurrentStep(client, focusMilestone.id, user.id)
      : null

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
        currentStep,
        personalGreeting: finalGreeting,
      })
    }

    return Response.json({ briefing: savedBriefing, cached: false, currentStep, personalGreeting: finalGreeting })

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
