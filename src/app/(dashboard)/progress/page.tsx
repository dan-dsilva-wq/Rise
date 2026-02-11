import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { KnowledgeGraphContent } from '@/components/progress/KnowledgeGraphContent'
import { RawGraphData } from '@/components/progress/graph/types'

export default async function ProgressPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch all 5 data sources in parallel
  const [
    { data: facts },
    { data: insights },
    { data: patterns },
    { data: brainDumps },
    { data: understanding },
  ] = await Promise.all([
    supabase
      .from('user_profile_facts')
      .select('id, category, fact')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase
      .from('ai_insights')
      .select('id, insight_type, content, importance')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('patterns')
      .select('id, description, confidence')
      .eq('user_id', user.id)
      .order('confidence', { ascending: false })
      .limit(20),
    supabase
      .from('brain_dumps')
      .select('id, summary')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('user_understanding')
      .select('values, motivations, strengths, blockers, definition_of_success')
      .eq('user_id', user.id)
      .limit(1)
      .single(),
  ])

  const rawData: RawGraphData = {
    facts: facts || [],
    insights: insights || [],
    patterns: patterns || [],
    brainDumps: brainDumps || [],
    understanding: understanding || null,
  }

  return <KnowledgeGraphContent rawData={rawData} />
}
