type FocusLevel = 'active' | 'next' | 'backlog' | null

interface MilestoneFocusRow {
  id: string
  status: string
  focus_level: FocusLevel
  sort_order: number
}

const isActionable = (status: string) =>
  status !== 'completed' && status !== 'discarded' && status !== 'idea'

const bySortOrder = (a: MilestoneFocusRow, b: MilestoneFocusRow) => a.sort_order - b.sort_order

/**
 * Keep milestone focus lanes healthy after any completion/status change:
 * - exactly one active milestone when actionable milestones exist
 * - at most three next milestones
 * - refill next from backlog when slots open
 */
export async function rebalanceMilestoneFocusPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  projectId: string
): Promise<void> {
  const now = new Date().toISOString()

  const { data, error } = await client
    .from('milestones')
    .select('id, status, focus_level, sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  if (error) throw error

  const actionable = ((data || []) as MilestoneFocusRow[])
    .filter(milestone => isActionable(milestone.status))
    .sort(bySortOrder)

  if (actionable.length === 0) return

  const activeCandidates = actionable
    .filter(milestone => milestone.focus_level === 'active')
    .sort(bySortOrder)

  let activeId: string | null = activeCandidates[0]?.id || null

  if (activeCandidates.length > 1) {
    const demoteIds = activeCandidates.slice(1).map(milestone => milestone.id)
    await client
      .from('milestones')
      .update({ focus_level: 'backlog', updated_at: now })
      .in('id', demoteIds)
  }

  if (!activeId) {
    const promoteToActive =
      actionable.find(milestone => milestone.focus_level === 'next') || actionable[0]

    activeId = promoteToActive.id
    await client
      .from('milestones')
      .update({ focus_level: 'active', updated_at: now })
      .eq('id', activeId)
  }

  const nextCandidates = actionable
    .filter(milestone => milestone.id !== activeId && milestone.focus_level === 'next')
    .sort(bySortOrder)

  if (nextCandidates.length > 3) {
    const overflowIds = nextCandidates.slice(3).map(milestone => milestone.id)
    await client
      .from('milestones')
      .update({ focus_level: 'backlog', updated_at: now })
      .in('id', overflowIds)
  }

  const keptNextIds = nextCandidates.slice(0, 3).map(milestone => milestone.id)
  const nextSlots = 3 - keptNextIds.length

  if (nextSlots <= 0) return

  const promoteToNext = actionable
    .filter(
      milestone =>
        milestone.id !== activeId &&
        !keptNextIds.includes(milestone.id) &&
        milestone.focus_level !== 'next'
    )
    .sort(bySortOrder)
    .slice(0, nextSlots)

  if (promoteToNext.length === 0) return

  await client
    .from('milestones')
    .update({ focus_level: 'next', updated_at: now })
    .in('id', promoteToNext.map(milestone => milestone.id))
}

