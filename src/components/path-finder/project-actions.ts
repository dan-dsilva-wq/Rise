import { addDebugLog } from '@/components/ui/ConnectionStatus'
import { rebalanceMilestoneFocusPipeline } from '@/lib/milestones/focusPipeline'
import type {
  ActionResult,
  ExistingProject,
  MilestoneItem,
  ProjectAction,
  ProjectListItem,
} from './types'
export async function fetchExistingProjects({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client,
  userId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
  userId: string
}): Promise<ExistingProject[] | null> {
    if (!userId) {
      return []
    }

    try {
      const { data: projects, error: projectsError } = await client
        .from('projects')
        .select('id, name, description, status')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (projectsError) {
        addDebugLog('error', 'fetchProjects failed', projectsError.message)
        return null
      }

      const projectRows = (projects || []) as ProjectListItem[]
      const projectsWithMilestones = await Promise.all(projectRows.map(async (project) => {
        const { data: allItems, error: milestonesError } = await client
          .from('milestones')
          .select('id, title, status, sort_order, notes, focus_level, completed_at')
          .eq('project_id', project.id)
          .neq('status', 'discarded') // Don't show discarded
          .order('sort_order', { ascending: true })

        if (milestonesError) {
          addDebugLog('warn', 'fetchProjects milestones failed', `${project.id.slice(0, 8)}: ${milestonesError.message}`)
        }

        // Separate active milestones from ideas
        const milestoneRows = (allItems || []) as MilestoneItem[]
        const milestones = milestoneRows.filter(m => m.status !== 'idea')
        const ideas = milestoneRows.filter(m => m.status === 'idea')

        // Batch-fetch step counts for all milestones in this project
        const milestoneIds = milestones.map(m => m.id)
        const stepCountMap: Record<string, { total: number; completed: number }> = {}
        if (milestoneIds.length > 0) {
          const { data: stepsData } = await client
            .from('milestone_steps')
            .select('milestone_id, completed_at')
            .in('milestone_id', milestoneIds)

          if (stepsData) {
            for (const step of stepsData) {
              const entry = stepCountMap[step.milestone_id] || { total: 0, completed: 0 }
              entry.total++
              if (step.completed_at) entry.completed++
              stepCountMap[step.milestone_id] = entry
            }
          }
        }

        return {
          ...project,
          milestones: milestones.map(m => ({
            ...m,
            completedSteps: stepCountMap[m.id]?.completed ?? 0,
            totalSteps: stepCountMap[m.id]?.total ?? 0,
          })),
          ideas,
        }
      }))
      return projectsWithMilestones
    } catch (error) {
      addDebugLog('error', 'fetchProjects exception', String(error))
      return null
    }
}

  // Execute project actions from AI
export async function executeProjectActions({
  actions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client,
  userId,
  fetchProjects,
}: {
  actions: ProjectAction[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
  userId: string
  fetchProjects: () => Promise<ExistingProject[] | null>
}): Promise<ActionResult[]> {
    if (!userId) {
      addDebugLog('error', 'No userId for actions')
      return []
    }
    const results: ActionResult[] = []
    const projectLookupCache = new Map<string, { id: string; name: string } | null>()
    const normalizeUuid = (value?: string) => value?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]

    const resolveProject = async (projectId: string) => {
      if (projectLookupCache.has(projectId)) {
        return projectLookupCache.get(projectId) ?? null
      }

      const { data, error } = await client
        .from('projects')
        .select('id, name')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw error

      const resolved = data ? { id: data.id as string, name: data.name as string } : null
      projectLookupCache.set(projectId, resolved)
      return resolved
    }

    addDebugLog('info', 'executeProjectActions', JSON.stringify(actions).slice(0, 200))

    for (const action of actions) {
      try {
        addDebugLog('info', `Executing ${action.type}`, action.projectId || action.name || '')
        if (action.type === 'create' && action.name) {
          // Create project
          const { data: projectData, error: projectError } = await client
            .from('projects')
            .insert({
              user_id: userId,
              name: action.name,
              description: action.description || '',
              status: 'discovery',
            })
            .select()
            .single()

          if (projectError) throw projectError

          // Create milestones with smart focus defaults
          // First milestone = active, next 2 = next, rest = backlog
          if (action.milestones && action.milestones.length > 0) {
            const milestonesData = action.milestones.map((title, index) => ({
              project_id: projectData.id,
              user_id: userId,
              title,
              sort_order: index,
              status: 'pending',
              focus_level: index === 0 ? 'active' : index <= 2 ? 'next' : 'backlog',
            }))
            const { data: createdMilestones, error: milestonesError } = await client
              .from('milestones')
              .insert(milestonesData)
              .select('id, title')
            if (milestonesError) throw milestonesError

            // Save steps for each milestone if provided
            if (action.milestonesWithSteps && createdMilestones) {
              for (const createdMilestone of createdMilestones) {
                const milestoneWithSteps = action.milestonesWithSteps.find(
                  m => m.title === createdMilestone.title
                )
                if (milestoneWithSteps && milestoneWithSteps.steps.length > 0) {
                  const stepsData = milestoneWithSteps.steps.map((text, stepIndex) => ({
                    milestone_id: createdMilestone.id,
                    user_id: userId,
                    text,
                    step_type: 'action',
                    sort_order: stepIndex,
                  }))
                  const { error: stepsError } = await client.from('milestone_steps').insert(stepsData)
                  if (stepsError) {
                    console.warn('Failed to save steps for milestone:', createdMilestone.title, stepsError)
                  }
                }
              }
            }
          }

          results.push({
            type: 'create_project',
            text: `Created project: ${action.name}`,
            projectId: projectData.id,
            projectName: action.name,
          })
        } else if (action.type === 'add_milestone' && action.projectId && action.newMilestone) {
          const normalizedProjectId = normalizeUuid(action.projectId)
          if (!normalizedProjectId) {
            results.push({ type: 'add_milestone', text: 'Failed: Invalid project id format' })
            continue
          }
          const project = await resolveProject(normalizedProjectId)
          if (!project) {
            results.push({ type: 'add_milestone', text: 'Failed: Project not found (it may have been deleted)' })
            continue
          }

          // Get current milestone count for sort order (exclude ideas)
          const { data: existing, error: existingError } = await client
            .from('milestones')
            .select('id, focus_level')
            .eq('project_id', normalizedProjectId)
            .eq('user_id', userId)
            .neq('status', 'idea')
            .neq('status', 'completed')
            .neq('status', 'discarded')

          if (existingError) throw existingError

          // Smart default: if no active, make this active; if < 3 next, make next; else backlog
          type MilestoneWithFocus = { id: string; focus_level: string }
          const hasActive = existing?.some((m: MilestoneWithFocus) => m.focus_level === 'active')
          const nextCount = existing?.filter((m: MilestoneWithFocus) => m.focus_level === 'next').length || 0
          const defaultFocus = !hasActive ? 'active' : nextCount < 3 ? 'next' : 'backlog'

          const { data: milestoneData, error: milestoneError } = await client.from('milestones').insert({
            project_id: normalizedProjectId,
            user_id: userId,
            title: action.newMilestone,
            sort_order: existing?.length || 0,
            status: 'pending',
            focus_level: defaultFocus,
          }).select().single()

          if (milestoneError) throw milestoneError

          // Save steps if provided
          if (action.newMilestoneSteps && action.newMilestoneSteps.length > 0 && milestoneData?.id) {
            const stepsData = action.newMilestoneSteps.map((text, stepIndex) => ({
              milestone_id: milestoneData.id,
              user_id: userId,
              text,
              step_type: 'action',
              sort_order: stepIndex,
            }))
            const { error: stepsError } = await client.from('milestone_steps').insert(stepsData)
            if (stepsError) {
              console.warn('Failed to save steps for milestone:', action.newMilestone, stepsError)
            }
          }

          const focusLabel = defaultFocus === 'active' ? ' (set as Active)' : defaultFocus === 'next' ? ' (added to Up Next)' : ''
          results.push({
            type: 'add_milestone',
            text: `Added milestone: ${action.newMilestone}${focusLabel}`,
            projectId: normalizedProjectId,
            projectName: project.name,
            milestoneId: milestoneData?.id,
            milestoneTitle: action.newMilestone,
          })
        } else if (action.type === 'add_idea' && action.projectId && action.newIdea) {
          const normalizedProjectId = normalizeUuid(action.projectId)
          if (!normalizedProjectId) {
            results.push({ type: 'add_idea', text: 'Failed: Invalid project id format' })
            continue
          }
          const project = await resolveProject(normalizedProjectId)
          if (!project) {
            results.push({ type: 'add_idea', text: 'Failed: Project not found (it may have been deleted)' })
            continue
          }

          // Add as idea (status = 'idea')
          const { data: existing, error: existingError } = await client
            .from('milestones')
            .select('id')
            .eq('project_id', normalizedProjectId)
            .eq('user_id', userId)

          if (existingError) throw existingError

          const { data: ideaData, error: ideaError } = await client.from('milestones').insert({
            project_id: normalizedProjectId,
            user_id: userId,
            title: action.newIdea,
            sort_order: existing?.length || 0,
            status: 'idea',
          }).select().single()

          if (ideaError) throw ideaError

          results.push({
            type: 'add_idea',
            text: `Added idea: ${action.newIdea}`,
            projectId: normalizedProjectId,
            projectName: project.name,
            milestoneId: ideaData?.id,
            milestoneTitle: action.newIdea,
            isIdea: true,
          })
        } else if (action.type === 'add_note' && action.milestoneId && action.newNote) {
          // Add note to existing milestone/idea
          const { data: milestone, error: findError } = await client
            .from('milestones')
            .select('id, title, notes, project_id, status')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !milestone) {
            results.push({ type: 'add_note', text: 'Failed: Milestone not found' })
            continue
          }

          // Append to existing notes or create new
          const updatedNotes = milestone.notes
            ? `${milestone.notes}\n• ${action.newNote}`
            : `• ${action.newNote}`

          const { error: updateError } = await client
            .from('milestones')
            .update({ notes: updatedNotes, updated_at: new Date().toISOString() })
            .eq('id', action.milestoneId)

          if (updateError) {
            results.push({ type: 'add_note', text: `Failed to add note: ${updateError.message}` })
          } else {
            results.push({
              type: 'add_note',
              text: `Added note to: ${milestone.title}`,
              projectId: milestone.project_id,
              milestoneId: milestone.id,
              milestoneTitle: milestone.title,
              isIdea: milestone.status === 'idea',
            })
          }
        } else if (action.type === 'promote_idea' && action.milestoneId) {
          // Promote idea to active milestone
          const { data: idea, error: findError } = await client
            .from('milestones')
            .select('id, title, status, project_id')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !idea) {
            results.push({ type: 'promote_idea', text: 'Failed: Idea not found' })
            continue
          }

          if (idea.status !== 'idea') {
            results.push({ type: 'promote_idea', text: `Already a milestone: ${idea.title}` })
            continue
          }

          const { error: updateError } = await client
            .from('milestones')
            .update({ status: 'pending', updated_at: new Date().toISOString() })
            .eq('id', action.milestoneId)

          if (updateError) {
            results.push({ type: 'promote_idea', text: `Failed to promote: ${updateError.message}` })
          } else {
            results.push({
              type: 'promote_idea',
              text: `Promoted to milestone: ${idea.title}`,
              projectId: idea.project_id,
              milestoneId: idea.id,
              milestoneTitle: idea.title,
            })
          }
        } else if (action.type === 'set_focus' && action.milestoneId && action.focusLevel) {
          // Set focus level for milestone
          addDebugLog('info', 'Set focus', `id=${action.milestoneId.slice(0, 8)} level=${action.focusLevel}`)

          const { data: milestone, error: findError } = await client
            .from('milestones')
            .select('id, title, project_id, focus_level, status')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !milestone) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push({ type: 'set_focus', text: 'Failed: Milestone not found' })
            continue
          }

          // If setting to 'active', first clear any existing active milestone in this project
          if (action.focusLevel === 'active') {
            await client
              .from('milestones')
              .update({ focus_level: 'backlog' })
              .eq('project_id', milestone.project_id)
              .eq('focus_level', 'active')
          }

          // If setting to 'next', check we don't exceed 3
          if (action.focusLevel === 'next') {
            const { data: existingNext } = await client
              .from('milestones')
              .select('id')
              .eq('project_id', milestone.project_id)
              .eq('focus_level', 'next')
              .neq('status', 'completed')
              .neq('status', 'discarded')

            const isAlreadyNext = milestone.focus_level === 'next'
            if ((existingNext?.length || 0) >= 3 && !isAlreadyNext) {
              addDebugLog('warn', 'Max 3 in Up Next', `project=${milestone.project_id.slice(0, 8)}`)
              results.push({ type: 'set_focus', text: 'Cannot add to Up Next: max 3 items allowed' })
              continue
            }
          }

          const { error: updateError } = await client
            .from('milestones')
            .update({ focus_level: action.focusLevel, updated_at: new Date().toISOString() })
            .eq('id', action.milestoneId)

          if (updateError) {
            addDebugLog('error', 'Set focus failed', updateError.message)
            results.push({ type: 'set_focus', text: `Failed to set focus: ${updateError.message}` })
          } else {
            const levelLabel = action.focusLevel === 'active' ? 'Active' : action.focusLevel === 'next' ? 'Up Next' : 'Backlog'
            addDebugLog('success', 'Focus set', `${milestone.title} -> ${levelLabel}`)
            results.push({
              type: 'set_focus',
              text: `Set "${milestone.title}" to ${levelLabel}`,
              projectId: milestone.project_id,
              milestoneId: milestone.id,
              milestoneTitle: milestone.title,
              isIdea: milestone.status === 'idea',
            })
          }
        } else if (action.type === 'update_status' && action.projectId && action.newStatus) {
          const normalizedProjectId = normalizeUuid(action.projectId)
          if (!normalizedProjectId) {
            results.push({ type: 'update_status', text: 'Failed: Invalid project id format' })
            continue
          }
          const project = await resolveProject(normalizedProjectId)
          if (!project) {
            results.push({ type: 'update_status', text: 'Failed: Project not found (it may have been deleted)' })
            continue
          }

          const { data: updatedProject, error: updateStatusError } = await client
            .from('projects')
            .update({ status: action.newStatus })
            .eq('id', normalizedProjectId)
            .eq('user_id', userId)
            .select('id')
            .maybeSingle()

          if (updateStatusError) {
            results.push({ type: 'update_status', text: `Failed to update status: ${updateStatusError.message}` })
            continue
          }
          if (!updatedProject) {
            results.push({ type: 'update_status', text: 'Failed: Project not found' })
            continue
          }

          results.push({
            type: 'update_status',
            text: `Updated ${project.name} to ${action.newStatus}`,
            projectId: normalizedProjectId,
            projectName: project.name,
          })
        } else if (action.type === 'edit_milestone' && action.milestoneId && action.newTitle) {
          // Edit milestone title
          addDebugLog('info', 'Edit milestone', `id=${action.milestoneId.slice(0, 8)} title=${action.newTitle}`)

          // First check if milestone exists
          const { data: existing, error: findError } = await client
            .from('milestones')
            .select('id, title, project_id, status')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !existing) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push({ type: 'edit_milestone', text: 'Failed: Milestone not found' })
            continue
          }

          const { error: updateError } = await client
            .from('milestones')
            .update({ title: action.newTitle, updated_at: new Date().toISOString() })
            .eq('id', action.milestoneId)

          if (updateError) {
            addDebugLog('error', 'Edit failed', updateError.message)
            results.push({ type: 'edit_milestone', text: `Failed to edit: ${updateError.message}` })
          } else {
            addDebugLog('success', 'Milestone edited', action.newTitle)
            results.push({
              type: 'edit_milestone',
              text: `Updated milestone: ${action.newTitle}`,
              projectId: existing.project_id,
              milestoneId: existing.id,
              milestoneTitle: action.newTitle,
              isIdea: existing.status === 'idea',
            })
          }
        } else if (action.type === 'complete_milestone' && action.milestoneId) {
          // Mark milestone as complete
          addDebugLog('info', 'Complete milestone', `id=${action.milestoneId.slice(0, 8)}`)

          const { data: milestone, error: findError } = await client
            .from('milestones')
            .select('id, title, status, project_id')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !milestone) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push({ type: 'complete_milestone', text: 'Failed: Milestone not found' })
            continue
          }

          addDebugLog('info', 'Found milestone', `title=${milestone.title} status=${milestone.status}`)

          const { error: updateError } = await client
            .from('milestones')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', action.milestoneId)

          if (updateError) {
            addDebugLog('error', 'Complete failed', updateError.message)
            results.push({ type: 'complete_milestone', text: `Failed to complete: ${updateError.message}` })
          } else {
            await rebalanceMilestoneFocusPipeline(client, milestone.project_id)

            addDebugLog('success', 'Milestone completed', milestone.title)
            results.push({
              type: 'complete_milestone',
              text: `Completed: ${milestone.title}`,
              projectId: milestone.project_id,
              milestoneId: milestone.id,
              milestoneTitle: milestone.title,
            })
          }
        } else if (action.type === 'discard_milestone' && action.milestoneId) {
          // Discard milestone (soft delete - keeps data)
          addDebugLog('info', 'Discard milestone', `id=${action.milestoneId.slice(0, 8)}`)

          const { data: milestone, error: findError } = await client
            .from('milestones')
            .select('id, title, status, project_id')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !milestone) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push({ type: 'discard_milestone', text: 'Failed: Milestone not found' })
            continue
          }

          addDebugLog('info', 'Found milestone', `title=${milestone.title} status=${milestone.status}`)

          const { error: updateError } = await client
            .from('milestones')
            .update({
              status: 'discarded',
              updated_at: new Date().toISOString(),
            })
            .eq('id', action.milestoneId)

          if (updateError) {
            addDebugLog('error', 'Discard failed', updateError.message)
            results.push({ type: 'discard_milestone', text: `Failed to discard: ${updateError.message}` })
          } else {
            addDebugLog('success', 'Milestone discarded', milestone.title)
            results.push({
              type: 'discard_milestone',
              text: `Discarded: ${milestone.title}`,
              projectId: milestone.project_id,
              milestoneId: milestone.id,
              milestoneTitle: milestone.title,
            })
          }
        } else if (action.type === 'reorder_milestones' && action.projectId && action.milestoneOrder) {
          // Reorder milestones
          const normalizedProjectId = normalizeUuid(action.projectId)
          if (!normalizedProjectId) {
            results.push({ type: 'reorder', text: 'Failed: Invalid project id format' })
            continue
          }
          addDebugLog('info', 'Reorder milestones', `project=${normalizedProjectId.slice(0, 8)} order=${action.milestoneOrder.length} items`)

          const project = await resolveProject(normalizedProjectId)
          if (!project) {
            addDebugLog('error', 'Project not found', action.projectId)
            results.push({ type: 'reorder', text: 'Failed: Project not found' })
            continue
          }

          // Update each milestone's sort_order
          let success = true
          for (let i = 0; i < action.milestoneOrder.length; i++) {
            const milestoneId = action.milestoneOrder[i]
            const { data: updatedMilestone, error } = await client
              .from('milestones')
              .update({ sort_order: i, updated_at: new Date().toISOString() })
              .eq('id', milestoneId)
              .eq('project_id', normalizedProjectId)
              .eq('user_id', userId)
              .select('id')
              .maybeSingle()

            if (error || !updatedMilestone) {
              const errorMsg = error?.message || 'milestone not found in project'
              addDebugLog('error', 'Reorder failed', `milestone ${milestoneId.slice(0, 8)}: ${errorMsg}`)
              success = false
              break
            }
          }

          if (success) {
            addDebugLog('success', 'Milestones reordered', `${action.milestoneOrder.length} milestones`)
            results.push({
              type: 'reorder',
              text: `Reordered milestones in ${project.name}`,
              projectId: normalizedProjectId,
              projectName: project.name,
            })
          } else {
            results.push({ type: 'reorder', text: 'Failed to reorder milestones' })
          }
        } else if (action.type === 'update_steps' && action.milestoneId && action.newSteps && action.newSteps.length > 0) {
          // Update steps for existing milestone
          addDebugLog('info', 'Update steps', `id=${action.milestoneId.slice(0, 8)} steps=${action.newSteps.length}`)

          const { data: milestone, error: findError } = await client
            .from('milestones')
            .select('id, title, project_id')
            .eq('id', action.milestoneId)
            .single()

          if (findError || !milestone) {
            addDebugLog('error', 'Milestone not found', `id=${action.milestoneId} error=${findError?.message}`)
            results.push({ type: 'edit_milestone', text: 'Failed: Milestone not found' })
            continue
          }

          // Delete existing steps for this milestone
          const { error: deleteError } = await client
            .from('milestone_steps')
            .delete()
            .eq('milestone_id', action.milestoneId)
            .eq('user_id', userId)

          if (deleteError) {
            addDebugLog('warn', 'Failed to delete old steps', deleteError.message)
          }

          // Insert new steps
          const stepsData = action.newSteps.map((text, stepIndex) => ({
            milestone_id: action.milestoneId!,
            user_id: userId,
            text,
            step_type: 'action',
            sort_order: stepIndex,
          }))

          const { error: insertError } = await client.from('milestone_steps').insert(stepsData)

          if (insertError) {
            addDebugLog('error', 'Failed to insert steps', insertError.message)
            results.push({ type: 'edit_milestone', text: `Failed to update steps: ${insertError.message}` })
          } else {
            addDebugLog('success', 'Steps updated', `${action.newSteps.length} steps for ${milestone.title}`)
            results.push({
              type: 'edit_milestone',
              text: `Updated steps for: ${milestone.title}`,
              projectId: milestone.project_id,
              milestoneId: milestone.id,
              milestoneTitle: milestone.title,
            })
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        addDebugLog('error', `Action ${action.type} failed`, errMsg)
        console.error('Failed to execute project action:', err)
        results.push({ type: action.type as ActionResult['type'], text: `Failed: ${action.type} - ${errMsg}` })
      }
    }

    // Refresh projects list
    await fetchProjects()
    addDebugLog('success', 'Actions complete', `${results.length} results`)
    return results
  }

