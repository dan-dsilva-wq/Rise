import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchAiContextForApi } from '@/lib/hooks/aiContextServer'
import { weaveMemory, synthesizeUserThread, generatePersonalGreeting, buildGreetingSignals, resolveCurrentStep, type GreetingMemorySignals } from '@/lib/ai/memoryWeaver'
import { ANTHROPIC_OPUS_MODEL } from '@/lib/ai/model-config'

// Extract momentum data from memory signals for the dashboard
function extractMomentum(signals: GreetingMemorySignals | undefined) {
  if (!signals) return null
  const milestonesThisWeek = signals.milestonesCompletedThisWeek ?? 0
  const daysSinceLastVisit = signals.daysSinceLastVisit ?? 0
  // Only return if there's meaningful data
  if (milestonesThisWeek === 0) return null
  return { milestonesThisWeek, daysSinceLastVisit }
}

/**
 * Fetches all data needed for a personal greeting + momentum in one shot.
 *
 * Previously this logic was duplicated across 4 code paths in this route
 * (cached w/ focus, cached w/o focus, no projects, fresh generation).
 * Now it's a single function that each path calls.
 *
 * @param wovenMemory - optional pre-fetched woven memory (fresh briefing path has it)
 * @param logCount - hint for `generatePersonalGreeting` (passed as `totalLogs` for new users).
 *   Use `'auto'` to pass the actual fetched log count (for no-projects path).
 */
async function fetchGreetingContext(
  supabaseClient: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  opts?: {
    wovenMemory?: Parameters<typeof buildGreetingSignals>[2]
    logCount?: number | 'auto'
    recentMilestoneTitle?: string | null
  },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabaseClient as any

  const [logsResult, profileResult, completionResult, memorySignals] = await Promise.all([
    client.from('daily_logs')
      .select('log_date, morning_mood, morning_energy, evening_mood, evening_energy, day_rating, gratitude_entry')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(5),
    client.from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single(),
    // Skip if caller already resolved the milestone title
    opts?.recentMilestoneTitle !== undefined
      ? Promise.resolve({ data: null })
      : client.from('milestones')
          .select('title, completed_at')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(1),
    buildGreetingSignals(supabaseClient, userId, opts?.wovenMemory ?? undefined),
  ])

  const logs = (logsResult.data || []) as Array<{
    log_date: string; morning_mood: number | null; morning_energy: number | null
    evening_mood: number | null; evening_energy: number | null; day_rating: number | null
    gratitude_entry: string | null
  }>

  // Resolve recent milestone title (within last 2 days)
  let milestoneTitle = opts?.recentMilestoneTitle ?? null
  if (milestoneTitle === undefined || milestoneTitle === null) {
    const completion = ((completionResult.data || []) as { title: string; completed_at: string }[])[0]
    milestoneTitle = completion?.completed_at
      && (Date.now() - new Date(completion.completed_at).getTime()) < 2 * 24 * 60 * 60 * 1000
      ? completion.title : null
  }

  const resolvedLogCount = opts?.logCount === 'auto' ? logs.length : opts?.logCount

  const personalGreeting = generatePersonalGreeting(
    logs,
    profileResult.data?.display_name || null,
    milestoneTitle,
    resolvedLogCount,
    memorySignals,
  )

  return { personalGreeting, momentum: extractMomentum(memorySignals), memorySignals, logs }
}

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
          // Fetch current step + greeting context in parallel
          const [currentStep, greetingCtx] = await Promise.all([
            resolveCurrentStep(supabaseClient, existingBriefing.focus_milestone_id, user.id),
            fetchGreetingContext(supabaseClient, user.id),
          ])
          return Response.json({ briefing: existingBriefing, cached: true, currentStep, personalGreeting: greetingCtx.personalGreeting, momentum: greetingCtx.momentum })
        }
      } else {
        // No focus milestone — still generate a greeting
        const greetingCtx = await fetchGreetingContext(supabaseClient, user.id)
        return Response.json({ briefing: existingBriefing, cached: true, personalGreeting: greetingCtx.personalGreeting, momentum: greetingCtx.momentum })
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
      // No projects — greeting + default briefing (pass logCount='auto' so greeting can detect brand-new users)
      const greetingCtx = await fetchGreetingContext(supabaseClient, user.id, { logCount: 'auto' })
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
      return Response.json({ briefing: defaultBriefing, cached: false, noProjects: true, personalGreeting: greetingCtx.personalGreeting, momentum: greetingCtx.momentum })
    }

    // Get milestones for ALL projects in parallel (was sequential per-project)
    const milestoneResults = await Promise.all(
      projects.map(project =>
        client
          .from('milestones')
          .select('id, title, status, focus_level')
          .eq('project_id', project.id)
          .neq('status', 'completed')
          .neq('status', 'discarded')
          .neq('status', 'idea')
          .order('sort_order', { ascending: true })
      )
    )

    const projectsWithMilestones: ProjectWithMilestones[] = projects.map((project, i) => ({
      ...project,
      milestones: (milestoneResults[i].data || []) as { id: string; title: string; status: string; focus_level: string }[],
    }))

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

    // Fetch AI context bank, unified memory, user thread, AND greeting data in parallel.
    // The greeting helper consolidates logs + profile + milestone queries that were
    // previously duplicated across 4 code paths in this route.
    const [aiContext, wovenMemory, userThread] = await Promise.all([
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
      synthesizeUserThread(supabaseClient, user.id, {
        includeWorkPatterns: true,
        lookbackDays: 14,
      }),
    ])

    // Fetch greeting context (logs, profile, milestone, signals → greeting + momentum)
    // Pass wovenMemory so buildGreetingSignals gets richer cross-conversation context
    const greetingCtx = await fetchGreetingContext(supabaseClient, user.id, { wovenMemory })
    const { personalGreeting } = greetingCtx

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

    // Add User Thread — shapes tone, pacing, and emotional awareness of the briefing
    const userThreadSection = userThread.threadBlock
      ? `\n\n${userThread.threadBlock}`
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
        ? await resolveCurrentStep(supabaseClient, focusMilestone.id, user.id)
        : null

      return Response.json({ briefing: savedBriefing, cached: false, currentStep, personalGreeting, momentum: greetingCtx.momentum })
    }

    const response = await getAnthropic().messages.create({
      model: ANTHROPIC_OPUS_MODEL,
      max_tokens: 300,
      system: `You are Rise - a supportive AI cofounder. You are ONE mind that remembers all conversations with this user. Generate a focused morning briefing.

Rules:
- mission_headline: 2-5 word action-oriented summary (e.g. "Build the landing page")
- mission_detail: One sentence connecting today's task to their bigger picture. Reference recent conversations or decisions if the memory context includes them.
- nudge: 1-2 sentences of motivation specific to WHERE they are right now. If they've been struggling, be gentle. If they're on a roll, push them. Reference open loops or emotional state if known.

Adapt tone to WHO they are (see User Thread below if present). Be real, not cheesy.

Respond ONLY with JSON:
{
  "mission_headline": "...",
  "mission_detail": "...",
  "nudge": "..."
}`,
      messages: [{
        role: 'user',
        content: `Here's my current project state:\n\n${projectContext}${contextBankSection}${memorySection}${userThreadSection}\n\nThe suggested focus for today is: ${focusMilestone ? `"${focusMilestone.title}" from project "${focusProject?.name}"` : 'No specific milestone set'}\n\nGenerate my morning briefing.`
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

    // Personal greeting comes from generatePersonalGreeting() (data-based, 8 tiers of context)
    // — no need for AI to duplicate this work
    const finalGreeting = personalGreeting

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
      ? await resolveCurrentStep(supabaseClient, focusMilestone.id, user.id)
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
        momentum: greetingCtx.momentum,
      })
    }

    return Response.json({ briefing: savedBriefing, cached: false, currentStep, personalGreeting: finalGreeting, momentum: greetingCtx.momentum })

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
