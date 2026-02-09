import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { generateGapAnalysisForUser } from '@/services/intelligence'

function asTypedClient(client: Awaited<ReturnType<typeof createClient>>): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const result = await generateGapAnalysisForUser(asTypedClient(supabase), user.id)

    return Response.json(result)
  } catch (error) {
    console.error('Intelligence gaps GET error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze gaps' },
      { status: 500 }
    )
  }
}
