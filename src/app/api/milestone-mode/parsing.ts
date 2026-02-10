import type { MilestoneAction } from './types'

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

function extractUuid(value: string | undefined): string | undefined {
  if (!value) return undefined
  const uuidMatch = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return uuidMatch?.[0]
}

export function parseMilestoneActions(message: string, fallbackMilestoneId: string): MilestoneAction[] {
  const actions: MilestoneAction[] = []

  for (const fields of parseTagBlocks(message, 'COMPLETE_STEP')) {
    const stepId = extractUuid(fields.step_id || fields.stepid || fields.id)
    const stepText = fields.step_text?.trim() || fields.step?.trim() || fields.text?.trim()
    const parsedStepNumber = fields.step_number ? parseInt(fields.step_number, 10) : NaN
    const stepNumber = Number.isFinite(parsedStepNumber) && parsedStepNumber > 0 ? parsedStepNumber : undefined

    if (stepId || stepText || stepNumber) {
      actions.push({
        type: 'complete_step',
        stepId,
        stepText,
        stepNumber,
      })
    }
  }

  for (const fields of parseTagBlocks(message, 'COMPLETE_MILESTONE')) {
    const milestoneId = extractUuid(fields.milestone_id || fields.milestoneid || fields.id) || fallbackMilestoneId
    actions.push({
      type: 'complete_milestone',
      milestoneId,
    })
  }

  return actions
}

export function stripMilestoneActionTags(message: string): string {
  return message
    .replace(/\[COMPLETE_STEP\][\s\S]*?\[\/COMPLETE_STEP\]/gi, '')
    .replace(/\[COMPLETE_MILESTONE\][\s\S]*?\[\/COMPLETE_MILESTONE\]/gi, '')
    .trim()
}
