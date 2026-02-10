import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import type { Profile, PathFinderConversation, PathFinderMessage, UserProfileFact } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch profile and data in parallel
  const [profileResult, conversationsResult, factsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle(),

    supabase
      .from('path_finder_conversations')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false }),

    supabase
      .from('user_profile_facts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('category')
      .order('created_at', { ascending: false }),
  ])

  let profile = profileResult.data as Profile | null

  // If user already onboarded, send them to dashboard
  if (profile && profile.has_onboarded !== false) {
    redirect('/')
  }

  // Ensure profile exists
  if (!profile) {
    const fallbackDisplayName = typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name
      : (user.email?.split('@')[0] ?? null)

    const { data: ensuredProfile, error: ensureProfileError } = await client
      .from('profiles')
      .upsert({
        id: user.id,
        display_name: fallbackDisplayName,
      })
      .select('*')
      .single()

    if (ensureProfileError) {
      console.error('Failed to ensure profile for onboarding:', ensureProfileError.message)
    } else {
      profile = ensuredProfile as Profile
    }
  }

  const allConversations = (conversationsResult.data || []) as PathFinderConversation[]
  const conversation = allConversations.length > 0 ? allConversations[0] : null
  const facts = (factsResult.data || []) as UserProfileFact[]

  // Fetch messages if there's an existing conversation
  let messages: PathFinderMessage[] = []
  if (conversation) {
    const { data: messagesData } = await supabase
      .from('path_finder_messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })

    messages = (messagesData || []) as PathFinderMessage[]
  }

  return (
    <OnboardingFlow
      userId={user.id}
      initialFacts={facts}
      initialConversations={allConversations}
      initialConversation={conversation}
      initialMessages={messages}
    />
  )
}
