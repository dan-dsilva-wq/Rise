import type { ExtractedContext, ExtractedInsight, MilestoneWithSteps, ProjectAction, SuggestedFact } from './types'
import type { InsightType, ProjectContextType } from '@/lib/supabase/types'
import {
  areNearDuplicateMemories,
  isLikelyRelevantInsight,
  isLikelyRelevantProfileFact,
  memorySignature,
  normalizeMemoryText,
} from '@/lib/memory/relevance'

export function parseTagBlocks(message: string, tag: string): Array<Record<string, string>> {
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
        .replace(/^\d+\.\s+/, '')
        .replace(/^\*\*(.+?)\*\*$/, '$1')
        .replace(/^`(.+)`$/, '$1')
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

export function extractUuid(value: string | undefined): string | undefined {
  if (!value) return undefined
  const uuidMatch = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return uuidMatch?.[0]
}

export function parseSuggestedFacts(assistantMessage: string): SuggestedFact[] {
  const suggestedFacts: SuggestedFact[] = []
  const seenBySignature = new Map<string, string>()
  const profileUpdateRegex = /\[PROFILE_UPDATE\]\s*category:\s*(\w+)\s*fact:\s*([^\[]+?)\s*\[\/PROFILE_UPDATE\]/g
  let match: RegExpExecArray | null
  while ((match = profileUpdateRegex.exec(assistantMessage)) !== null) {
    const category = match[1].toLowerCase()
    const fact = normalizeMemoryText(match[2].trim())

    if (!isLikelyRelevantProfileFact(fact)) continue

    if (['background', 'skills', 'situation', 'goals', 'preferences', 'constraints'].includes(category)) {
      const signature = memorySignature(fact)
      const existing = seenBySignature.get(signature)
      if (existing && areNearDuplicateMemories(existing, fact)) continue
      seenBySignature.set(signature, fact)

      suggestedFacts.push({
        category: category as SuggestedFact['category'],
        fact,
      })
    }
  }

  return suggestedFacts
}

export function parseExtractedContexts(assistantMessage: string): ExtractedContext[] {
  const extractedContexts: ExtractedContext[] = []
  for (const fields of parseTagBlocks(assistantMessage, 'PROJECT_CONTEXT')) {
    const projectId = extractUuid(fields.project_id || fields.projectid || fields.project)
    const contextType = fields.type?.toLowerCase() as ProjectContextType
    const key = fields.key?.trim()
    const value = fields.value?.trim()
    const confidence = fields.confidence ? parseFloat(fields.confidence) : 1.0

    if (
      projectId &&
      contextType &&
      key &&
      value &&
      ['tech_stack', 'target_audience', 'constraints', 'decisions', 'requirements'].includes(contextType)
    ) {
      extractedContexts.push({ projectId, type: contextType, key, value, confidence })
    }
  }

  return extractedContexts
}

export function parseExtractedInsights(assistantMessage: string): ExtractedInsight[] {
  const extractedInsights: ExtractedInsight[] = []
  const seenBySignature = new Map<string, string>()
  for (const fields of parseTagBlocks(assistantMessage, 'AI_INSIGHT')) {
    const insightType = fields.type?.toLowerCase() as InsightType
    const rawContent = fields.content?.trim()
    const importance = fields.importance ? parseInt(fields.importance, 10) : 5
    const content = rawContent ? normalizeMemoryText(rawContent) : undefined
    const projectId = extractUuid(fields.project_id || fields.projectid)

    if (
      content &&
      insightType &&
      ['discovery', 'decision', 'blocker', 'preference', 'learning'].includes(insightType) &&
      isLikelyRelevantInsight(content, importance)
    ) {
      const signature = memorySignature(content)
      const existing = seenBySignature.get(signature)
      if (existing && areNearDuplicateMemories(existing, content)) continue
      seenBySignature.set(signature, content)

      extractedInsights.push({ type: insightType, content, importance, projectId })
    }
  }

  return extractedInsights
}

export function parseProjectActions(assistantMessage: string): ProjectAction[] {
  const projectActions: ProjectAction[] = []

  for (const fields of parseTagBlocks(assistantMessage, 'CREATE_PROJECT')) {
    const name = fields.name?.trim()
    const description = fields.description?.trim()

    if (name && description) {
      const milestonesWithSteps: MilestoneWithSteps[] = []
      const milestones: string[] = []

      for (let i = 1; i <= 5; i++) {
        const milestoneTitle = fields[`milestone${i}`]?.trim()
        const milestoneStepsRaw = fields[`milestone${i}_steps`]?.trim()

        if (milestoneTitle) {
          milestones.push(milestoneTitle)
          const steps = milestoneStepsRaw
            ? milestoneStepsRaw.split('|').map(s => s.trim()).filter(s => s.length > 0)
            : []
          milestonesWithSteps.push({ title: milestoneTitle, steps })
        }
      }

      projectActions.push({
        type: 'create',
        name,
        description,
        milestones,
        milestonesWithSteps,
      })
    }
  }

  for (const fields of parseTagBlocks(assistantMessage, 'ADD_MILESTONE')) {
    const projectId = extractUuid(fields.project_id || fields.projectid || fields.project_id_uuid || fields.project)
    const newMilestone = fields.milestone?.trim()
    const stepsRaw = fields.steps?.trim()
    const newMilestoneSteps = stepsRaw
      ? stepsRaw.split('|').map(s => s.trim()).filter(s => s.length > 0)
      : []

    if (projectId && newMilestone) {
      projectActions.push({
        type: 'add_milestone',
        projectId,
        newMilestone,
        newMilestoneSteps,
      })
    } else {
      console.warn('[path-finder] Failed to parse ADD_MILESTONE block', fields)
    }
  }

  for (const fields of parseTagBlocks(assistantMessage, 'ADD_IDEA')) {
    const projectId = extractUuid(fields.project_id || fields.projectid || fields.project_id_uuid || fields.project)
    const newIdea = fields.idea?.trim()
    if (projectId && newIdea) {
      projectActions.push({
        type: 'add_idea',
        projectId,
        newIdea,
      })
    } else {
      console.warn('[path-finder] Failed to parse ADD_IDEA block', fields)
    }
  }

  const addNoteRegex = /\[ADD_NOTE\]\s*milestone_id:\s*([^\n]+)\s*note:\s*([^\n]+)\s*\[\/ADD_NOTE\]/g
  let noteMatch: RegExpExecArray | null
  while ((noteMatch = addNoteRegex.exec(assistantMessage)) !== null) {
    projectActions.push({
      type: 'add_note',
      milestoneId: noteMatch[1].trim(),
      newNote: noteMatch[2].trim(),
    })
  }

  const promoteIdeaRegex = /\[PROMOTE_IDEA\]\s*idea_id:\s*([^\n]+)\s*\[\/PROMOTE_IDEA\]/g
  let promoteMatch: RegExpExecArray | null
  while ((promoteMatch = promoteIdeaRegex.exec(assistantMessage)) !== null) {
    projectActions.push({
      type: 'promote_idea',
      milestoneId: promoteMatch[1].trim(),
    })
  }

  const updateProjectRegex = /\[UPDATE_PROJECT\]\s*project_id:\s*([^\n]+)\s*status:\s*([^\n]+)\s*\[\/UPDATE_PROJECT\]/g
  let updateMatch: RegExpExecArray | null
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

  const editMilestoneRegex = /\[EDIT_MILESTONE\]\s*milestone_id:\s*([^\n]+)\s*title:\s*([^\n]+)\s*\[\/EDIT_MILESTONE\]/g
  let editMilestoneMatch: RegExpExecArray | null
  while ((editMilestoneMatch = editMilestoneRegex.exec(assistantMessage)) !== null) {
    projectActions.push({
      type: 'edit_milestone',
      milestoneId: editMilestoneMatch[1].trim(),
      newTitle: editMilestoneMatch[2].trim(),
    })
  }

  const completeMilestoneRegex = /\[COMPLETE_MILESTONE\]\s*milestone_id:\s*([^\n]+)\s*\[\/COMPLETE_MILESTONE\]/g
  let completeMilestoneMatch: RegExpExecArray | null
  while ((completeMilestoneMatch = completeMilestoneRegex.exec(assistantMessage)) !== null) {
    projectActions.push({
      type: 'complete_milestone',
      milestoneId: completeMilestoneMatch[1].trim(),
    })
  }

  const discardMilestoneRegex = /\[DISCARD_MILESTONE\]\s*milestone_id:\s*([^\n]+)\s*\[\/DISCARD_MILESTONE\]/g
  let discardMilestoneMatch: RegExpExecArray | null
  while ((discardMilestoneMatch = discardMilestoneRegex.exec(assistantMessage)) !== null) {
    projectActions.push({
      type: 'discard_milestone',
      milestoneId: discardMilestoneMatch[1].trim(),
    })
  }

  const reorderMilestonesRegex = /\[REORDER_MILESTONES\]\s*project_id:\s*([^\n]+)\s*order:\s*([^\n]+)\s*\[\/REORDER_MILESTONES\]/g
  let reorderMatch: RegExpExecArray | null
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

  const setFocusRegex = /\[SET_FOCUS\]\s*milestone_id:\s*([^\n]+)\s*level:\s*([^\n]+)\s*\[\/SET_FOCUS\]/g
  let focusMatch: RegExpExecArray | null
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

  for (const fields of parseTagBlocks(assistantMessage, 'UPDATE_STEPS')) {
    const milestoneId = extractUuid(fields.milestone_id || fields.milestoneid)
    const stepsRaw = fields.steps?.trim()
    const newSteps = stepsRaw
      ? stepsRaw.split('|').map(s => s.trim()).filter(s => s.length > 0)
      : []

    if (milestoneId && newSteps.length > 0) {
      projectActions.push({
        type: 'update_steps',
        milestoneId,
        newSteps,
      })
    }
  }

  const oldProjectRegex = /\[PROJECT_SUGGESTION\]\s*name:\s*([^\n]+)\s*description:\s*([^\n]+)\s*(milestone1:\s*[^\n]+\s*)?(milestone2:\s*[^\n]+\s*)?(milestone3:\s*[^\n]+\s*)?(milestone4:\s*[^\n]+\s*)?(milestone5:\s*[^\n]+\s*)?\[\/PROJECT_SUGGESTION\]/g
  let oldMatch: RegExpExecArray | null
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

  return projectActions
}

export function stripPathFinderStructuredTags(message: string): string {
  return message
    .replace(/\[PROFILE_UPDATE\][\s\S]*?\[\/PROFILE_UPDATE\]/g, '')
    .replace(/\[PROJECT_CONTEXT\][\s\S]*?\[\/PROJECT_CONTEXT\]/g, '')
    .replace(/\[AI_INSIGHT\][\s\S]*?\[\/AI_INSIGHT\]/g, '')
    .replace(/\[CREATE_PROJECT\][\s\S]*?\[\/CREATE_PROJECT\]/g, '')
    .replace(/\[ADD_MILESTONE\][\s\S]*?\[\/ADD_MILESTONE\]/g, '')
    .replace(/\[ADD_IDEA\][\s\S]*?\[\/ADD_IDEA\]/g, '')
    .replace(/\[ADD_NOTE\][\s\S]*?\[\/ADD_NOTE\]/g, '')
    .replace(/\[PROMOTE_IDEA\][\s\S]*?\[\/PROMOTE_IDEA\]/g, '')
    .replace(/\[SET_FOCUS\][\s\S]*?\[\/SET_FOCUS\]/g, '')
    .replace(/\[UPDATE_PROJECT\][\s\S]*?\[\/UPDATE_PROJECT\]/g, '')
    .replace(/\[EDIT_MILESTONE\][\s\S]*?\[\/EDIT_MILESTONE\]/g, '')
    .replace(/\[UPDATE_STEPS\][\s\S]*?\[\/UPDATE_STEPS\]/g, '')
    .replace(/\[COMPLETE_MILESTONE\][\s\S]*?\[\/COMPLETE_MILESTONE\]/g, '')
    .replace(/\[DISCARD_MILESTONE\][\s\S]*?\[\/DISCARD_MILESTONE\]/g, '')
    .replace(/\[REORDER_MILESTONES\][\s\S]*?\[\/REORDER_MILESTONES\]/g, '')
    .replace(/\[PROJECT_SUGGESTION\][\s\S]*?\[\/PROJECT_SUGGESTION\]/g, '')
    .trim()
}
