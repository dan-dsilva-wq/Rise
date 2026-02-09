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

function parseTagBlocks(message: string, tag: string): Array<Record<string, string>> {
  const blocks: Array<Record<string, string>> = []
  const blockRegex = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, 'gi')
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = blockRegex.exec(message)) !== null) {
    const fields: Record<string, string> = {}
    const lines = (blockMatch[1] || '').split('\n')
    let currentKey: string | null = null

    for (const rawLine of lines) {
      const line = rawLine
        .trim()
        .replace(/^[-*]\s+/, '')
      if (!line) continue

      const fieldMatch = line.match(/^`?([a-zA-Z0-9_]+)`?\s*[:=]\s*(.*)$/)
      if (fieldMatch) {
        currentKey = fieldMatch[1].toLowerCase()
        fields[currentKey] = fieldMatch[2].trim()
        continue
      }

      if (currentKey) {
        fields[currentKey] = `${fields[currentKey]} ${line}`.trim()
      }
    }

    blocks.push(fields)
  }

  return blocks
}

function stripTags(message: string): string {
  return message
    .replace(/\[SET_FOCUS\][\s\S]*?\[\/SET_FOCUS\]/gi, '')
    .replace(/\[REORDER_MILESTONES\][\s\S]*?\[\/REORDER_MILESTONES\]/gi, '')
    .replace(/\[DISCARD_MILESTONE\][\s\S]*?\[\/DISCARD_MILESTONE\]/gi, '')
    .trim()
}

function extractUuid(value: string | undefined): string | null {
  if (!value) return null
  const uuidMatch = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return uuidMatch ? uuidMatch[0] : null
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body = (await request.json()) as { projectId?: string }
    const projectId = body.projectId?.trim()
    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 })
    }

    const { data: project, error: projectError } = await client
      .from('projects')
      .select('id, name, description')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (projectError || !project) {
      return Response.json({ error: projectError?.message || 'Project not found' }, { status: 404 })
    }

    const { data: milestoneRows, error: milestoneError } = await client
      .from('milestones')
      .select('id, title, status, focus_level, sort_order')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .neq('status', 'discarded')
      .order('sort_order', { ascending: true })

    if (milestoneError) {
      return Response.json({ error: milestoneError.message }, { status: 500 })
    }

    const milestones = (milestoneRows || []) as Array<{
      id: string
      title: string
      status: 'pending' | 'in_progress' | 'completed' | 'discarded' | 'idea'
      focus_level: 'active' | 'next' | 'backlog'
      sort_order: number
    }>

    const actionableMilestones = milestones.filter(m => m.status !== 'completed' && m.status !== 'idea')
    if (actionableMilestones.length === 0) {
      return Response.json({ summary: 'No incomplete milestones to reorganize.' })
    }

    const milestoneList = milestones.map((milestone, index) => (
      `${index + 1}. ${milestone.title} [id: ${milestone.id}] [status: ${milestone.status}] [focus: ${milestone.focus_level}]`
    )).join('\n')

    const prompt = `Project: ${project.name}
Description: ${project.description || 'No description provided.'}

Milestones:
${milestoneList}

Reorganize these milestones with strict focus management:
- Exactly 1 active milestone (the single highest-impact incomplete item)
- Up to 3 next milestones
- Everything else backlog
- Consider dependencies and logical sequencing
- Suggest discarding obvious duplicates by using DISCARD_MILESTONE tags

Return a short rationale, then any needed tags.`

    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: `You are reorganizing milestone priority for execution.
You MUST use only these tags for structural changes:

[SET_FOCUS]
milestone_id: <uuid>
level: <active|next|backlog>
[/SET_FOCUS]

[REORDER_MILESTONES]
project_id: <uuid>
order: <comma-separated milestone ids in desired order>
[/REORDER_MILESTONES]

[DISCARD_MILESTONE]
milestone_id: <uuid>
[/DISCARD_MILESTONE]

Rules:
- Never assign completed milestones to active/next/backlog changes.
- Only use ids that were provided.
- Keep output concise.`,
      messages: [{ role: 'user', content: prompt }],
    })

    const assistantMessage = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('\n')

    const validIds = new Set(milestones.map(m => m.id))
    const now = new Date().toISOString()

    const discardIds = parseTagBlocks(assistantMessage, 'DISCARD_MILESTONE')
      .map(fields => extractUuid(fields.milestone_id || fields.id || ''))
      .filter((id): id is string => !!id && validIds.has(id))

    const uniqueDiscardIds = Array.from(new Set(discardIds)).filter(id => {
      const milestone = milestones.find(item => item.id === id)
      return milestone && milestone.status !== 'completed'
    })

    if (uniqueDiscardIds.length > 0) {
      await client
        .from('milestones')
        .update({ status: 'discarded', updated_at: now })
        .in('id', uniqueDiscardIds)
    }

    const workingMilestones = milestones.filter(m => !uniqueDiscardIds.includes(m.id) && m.status !== 'discarded')
    const focusCandidates = workingMilestones.filter(m => m.status !== 'completed' && m.status !== 'idea')

    const setFocusBlocks = parseTagBlocks(assistantMessage, 'SET_FOCUS')
    const activeCandidate = setFocusBlocks
      .find(fields => (fields.level || '').toLowerCase() === 'active')
    const requestedActiveId = extractUuid(activeCandidate?.milestone_id || activeCandidate?.id || '')

    const requestedNextIds = setFocusBlocks
      .filter(fields => (fields.level || '').toLowerCase() === 'next')
      .map(fields => extractUuid(fields.milestone_id || fields.id || ''))
      .filter((id): id is string => !!id)

    const validFocusIds = new Set(focusCandidates.map(m => m.id))
    const activeId = requestedActiveId && validFocusIds.has(requestedActiveId)
      ? requestedActiveId
      : (focusCandidates[0]?.id || null)

    const nextIds = Array.from(new Set(requestedNextIds))
      .filter(id => id !== activeId && validFocusIds.has(id))
      .slice(0, 3)

    if (focusCandidates.length > 0) {
      await client
        .from('milestones')
        .update({ focus_level: 'backlog', updated_at: now })
        .eq('project_id', projectId)
        .neq('status', 'completed')
        .neq('status', 'discarded')
        .neq('status', 'idea')

      if (activeId) {
        await client
          .from('milestones')
          .update({ focus_level: 'active', updated_at: now })
          .eq('id', activeId)
      }

      if (nextIds.length > 0) {
        await client
          .from('milestones')
          .update({ focus_level: 'next', updated_at: now })
          .in('id', nextIds)
      }
    }

    const reorderBlocks = parseTagBlocks(assistantMessage, 'REORDER_MILESTONES')
    const orderLine = reorderBlocks[0]?.order || ''
    const requestedOrder = orderLine
      .split(',')
      .map(token => extractUuid(token))
      .filter((id): id is string => !!id && validIds.has(id))

    const requestedIndexById = new Map<string, number>()
    requestedOrder.forEach((id, index) => {
      requestedIndexById.set(id, index)
    })

    const effectiveFocusById = new Map<string, 'active' | 'next' | 'backlog'>()
    focusCandidates.forEach(milestoneRow => {
      effectiveFocusById.set(milestoneRow.id, 'backlog')
    })
    if (activeId) {
      effectiveFocusById.set(activeId, 'active')
    }
    nextIds.forEach(id => {
      effectiveFocusById.set(id, 'next')
    })

    const rankMilestone = (milestoneRow: (typeof workingMilestones)[number]) => {
      if (milestoneRow.status === 'completed') return 3
      if (milestoneRow.status === 'idea') return 4
      const focus = effectiveFocusById.get(milestoneRow.id) || milestoneRow.focus_level
      if (focus === 'active') return 0
      if (focus === 'next') return 1
      return 2
    }

    const finalOrder = workingMilestones
      .slice()
      .sort((a, b) => {
        const rankDelta = rankMilestone(a) - rankMilestone(b)
        if (rankDelta !== 0) return rankDelta

        const aRequestedIndex = requestedIndexById.get(a.id)
        const bRequestedIndex = requestedIndexById.get(b.id)
        if (aRequestedIndex !== undefined && bRequestedIndex !== undefined) {
          return aRequestedIndex - bRequestedIndex
        }
        if (aRequestedIndex !== undefined) return -1
        if (bRequestedIndex !== undefined) return 1

        return a.sort_order - b.sort_order
      })
      .map(m => m.id)

    for (let index = 0; index < finalOrder.length; index += 1) {
      await client
        .from('milestones')
        .update({ sort_order: index, updated_at: now })
        .eq('id', finalOrder[index])
    }

    const summaryParts: string[] = []
    if (activeId) {
      const activeMilestone = milestones.find(m => m.id === activeId)
      if (activeMilestone) {
        summaryParts.push(`Active set to "${activeMilestone.title}".`)
      }
    }
    if (nextIds.length > 0) {
      summaryParts.push(`${nextIds.length} milestone${nextIds.length === 1 ? '' : 's'} moved to Up Next.`)
    }
    if (uniqueDiscardIds.length > 0) {
      summaryParts.push(`${uniqueDiscardIds.length} milestone${uniqueDiscardIds.length === 1 ? '' : 's'} discarded.`)
    }
    if (finalOrder.length > 1) {
      summaryParts.push('Milestone order updated.')
    }

    return Response.json({
      summary: summaryParts.join(' ') || 'Milestones reorganized.',
      rationale: stripTags(assistantMessage),
    })
  } catch (error) {
    console.error('Project reorganize API error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to reorganize milestones' },
      { status: 500 }
    )
  }
}
