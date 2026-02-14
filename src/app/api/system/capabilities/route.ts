import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getCapabilitySnapshot,
  type CapabilityAudience,
} from '@/lib/path-finder/app-capabilities'

const VALID_AUDIENCES: CapabilityAudience[] = ['general', 'path_finder', 'project_chat', 'milestone_mode']

export async function GET(request: NextRequest) {
  try {
    const supabaseClient = await createClient()
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const rawAudience = request.nextUrl.searchParams.get('audience') ?? 'general'
    if (!VALID_AUDIENCES.includes(rawAudience as CapabilityAudience)) {
      return Response.json({ error: 'Invalid capability audience' }, { status: 400 })
    }

    const snapshot = getCapabilitySnapshot(rawAudience as CapabilityAudience)
    return Response.json(snapshot)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to load capability map' },
      { status: 500 }
    )
  }
}
