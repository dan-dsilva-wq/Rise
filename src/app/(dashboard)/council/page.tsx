import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CouncilContent } from '@/components/council/CouncilContent'

export const dynamic = 'force-dynamic'

export default async function CouncilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <CouncilContent />
}
