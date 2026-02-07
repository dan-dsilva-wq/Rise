import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import type { OrchestrationDispatchStatus } from '@/types/orchestration'
import {
  assembleProjectContextForUser,
  generateClaudeCodePrompt,
  listDispatchedTasksForUser,
  logDispatchedTaskForUser,
  updateDispatchedTaskStatusForUser,
} from '@/services/orchestration'

function parseStepIndex(input: unknown): number {
  if (typeof input === 'number' && Number.isFinite(input)) return Math.max(0, Math.floor(input))
  if (typeof input === 'string') {
    const parsed = Number.parseInt(input, 10)
    if (Number.isFinite(parsed)) return Math.max(0, parsed)
  }
  return 0
}

function isValidStatus(status: unknown): status is OrchestrationDispatchStatus {
  return status === 'pending' || status === 'done'
}

function asTypedClient(client: Awaited<ReturnType<typeof createClient>>): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('projectId')
    const milestoneId = searchParams.get('milestoneId') || undefined

    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 })
    }

    const dispatches = await listDispatchedTasksForUser(
      asTypedClient(supabase),
      user.id,
      projectId,
      { milestoneId }
    )

    return Response.json({ dispatches })
  } catch (error) {
    console.error('Orchestration dispatch GET error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch dispatches' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body = (await request.json()) as {
      projectId?: string
      milestoneId?: string
      stepIndex?: number | string
    }

    const projectId = body.projectId?.trim()
    const milestoneId = body.milestoneId?.trim()
    const stepIndex = parseStepIndex(body.stepIndex)

    if (!projectId || !milestoneId) {
      return Response.json({ error: 'projectId and milestoneId are required' }, { status: 400 })
    }

    const context = await assembleProjectContextForUser(
      asTypedClient(supabase),
      user.id,
      projectId,
      milestoneId,
      stepIndex
    )

    const prompt = generateClaudeCodePrompt(context)

    const dispatch = await logDispatchedTaskForUser(asTypedClient(supabase), user.id, {
      projectId,
      milestoneId,
      stepIndex,
      stepText: context.task.currentStep,
      mode: context.task.mode,
      prompt,
      acceptanceCriteria: context.acceptanceCriteria,
      status: 'pending',
    })

    return Response.json({
      context,
      prompt,
      dispatch,
    })
  } catch (error) {
    console.error('Orchestration dispatch POST error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to dispatch task' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const body = (await request.json()) as {
      projectId?: string
      dispatchId?: string
      status?: OrchestrationDispatchStatus
    }

    const projectId = body.projectId?.trim()
    const dispatchId = body.dispatchId?.trim()
    const status = body.status

    if (!projectId || !dispatchId || !isValidStatus(status)) {
      return Response.json(
        { error: 'projectId, dispatchId, and valid status are required' },
        { status: 400 }
      )
    }

    const updatedDispatch = await updateDispatchedTaskStatusForUser(
      asTypedClient(supabase),
      user.id,
      projectId,
      dispatchId,
      status
    )

    if (!updatedDispatch) {
      return Response.json({ error: 'Dispatch not found' }, { status: 404 })
    }

    return Response.json({ dispatch: updatedDispatch })
  } catch (error) {
    console.error('Orchestration dispatch PATCH error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to update dispatch status' },
      { status: 500 }
    )
  }
}
