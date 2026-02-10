import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await client
    .from('profiles')
    .update({ has_onboarded: true })
    .eq('id', user.id)

  if (error) {
    console.error('Failed to complete onboarding:', error.message)
    return Response.json({ error: 'Failed to update profile' }, { status: 500 })
  }

  return Response.json({ success: true })
}
