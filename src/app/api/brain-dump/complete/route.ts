import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { saveAiInsight, saveUserProfileFact } from '@/lib/hooks/aiContextServer'
import { ANTHROPIC_SONNET_MODEL } from '@/lib/ai/model-config'
import type { InsightType, ProfileCategory } from '@/lib/supabase/types'

let anthropic: Anthropic | null = null
function getAnthropic() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropic
}

interface TranscriptMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

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
        .replace(/^\d+\.\s+/, '')
        .replace(/^\*\*(.+?)\*\*$/, '$1')
        .replace(/^`(.+)`$/, '$1')
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

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const supabaseClient = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = supabaseClient as any
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { messages, durationSeconds }: { messages: TranscriptMessage[]; durationSeconds: number } = await request.json()

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'Transcript required' }, { status: 400 })
    }

    // Format transcript for Claude
    const transcriptText = messages
      .map(m => `${m.role === 'user' ? 'USER' : 'RISE'}: ${m.content}`)
      .join('\n\n')

    const extractionPrompt = `Analyze this brain dump conversation transcript and extract structured information.

TRANSCRIPT:
${transcriptText}

Extract the following using these EXACT tags:

[BRAIN_DUMP_ANALYSIS]
summary: A concise 1-2 sentence recap of what they processed
rise_input: One short, practical "Rise take" insight or pattern you noticed
mood: The user's overall mood (e.g., excited, anxious, frustrated, reflective, energized, overwhelmed)
energy: A number 1-10 representing their energy level
topics: Comma-separated list of topics discussed
[/BRAIN_DUMP_ANALYSIS]

For each person mentioned by the user (not Rise):
[PERSON_MENTIONED]
name: The person's name or identifier
context: How they were mentioned / their relationship
[/PERSON_MENTIONED]

For each decision the user made or is considering:
[DECISION_MADE]
decision: What the decision is about
status: made / considering / deferred
details: Any specifics about the decision
[/DECISION_MADE]

For each problem or challenge mentioned:
[PROBLEM_MENTIONED]
problem: What the problem is
severity: low / medium / high
context: Additional context
[/PROBLEM_MENTIONED]

For important facts about the user that should be remembered:
[PROFILE_UPDATE]
category: background / skills / situation / goals / preferences / constraints
fact: The specific fact to remember
[/PROFILE_UPDATE]

For key insights worth tracking:
[INSIGHT]
type: discovery / decision / blocker / preference / learning
content: The insight
importance: 1-10
[/INSIGHT]

Only include tags where you actually found relevant information. Be specific and concise.`

    const response = await getAnthropic().messages.create({
      model: ANTHROPIC_SONNET_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: extractionPrompt }],
    })

    const analysisText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('\n')

    // Parse all extracted data
    const analysisBlocks = parseTagBlocks(analysisText, 'BRAIN_DUMP_ANALYSIS')
    const analysis = analysisBlocks[0] || {}

    const people = parseTagBlocks(analysisText, 'PERSON_MENTIONED')
    const decisions = parseTagBlocks(analysisText, 'DECISION_MADE')
    const problems = parseTagBlocks(analysisText, 'PROBLEM_MENTIONED')
    const profileUpdates = parseTagBlocks(analysisText, 'PROFILE_UPDATE')
    const insights = parseTagBlocks(analysisText, 'INSIGHT')

    const topics = analysis.topics
      ? analysis.topics.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []

    const combinedSummary = [analysis.summary, analysis.rise_input ? `Rise input: ${analysis.rise_input}` : null]
      .filter(Boolean)
      .join('\n')

    const energyLevel = analysis.energy ? parseInt(analysis.energy, 10) : null
    const validEnergy = energyLevel && energyLevel >= 1 && energyLevel <= 10 ? energyLevel : null

    // Save brain dump record
    const { data: brainDump, error: insertError } = await supabase
      .from('brain_dumps')
      .insert({
        user_id: user.id,
        transcript: messages,
        summary: combinedSummary || analysis.summary || null,
        mood: analysis.mood || null,
        energy_level: validEnergy,
        topics,
        people_mentioned: people,
        decisions,
        problems,
        duration_seconds: durationSeconds || null,
        message_count: messages.filter((m: TranscriptMessage) => m.role === 'user').length,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error saving brain dump:', insertError)
    }

    // Save profile facts in parallel
    const profilePromises = profileUpdates.map(update => {
      const validCategories = ['background', 'skills', 'situation', 'goals', 'preferences', 'constraints']
      const category = validCategories.includes(update.category) ? update.category as ProfileCategory : 'situation'
      if (!update.fact) return Promise.resolve()

      return saveUserProfileFact(supabaseClient, user.id, category, update.fact)
    })

    // Save insights in parallel
    const insightPromises = insights.map(insight => {
      const validTypes = ['discovery', 'decision', 'blocker', 'preference', 'learning']
      const type = validTypes.includes(insight.type) ? insight.type as InsightType : 'discovery'
      if (!insight.content) return Promise.resolve()

      return saveAiInsight(supabaseClient, user.id, type, insight.content, 'brain_dump', {
        importance: insight.importance ? parseInt(insight.importance, 10) : 5,
      })
    })

    await Promise.all([...profilePromises, ...insightPromises]).catch(err =>
      console.error('Error saving brain dump extractions:', err)
    )

    return Response.json({
      brainDumpId: brainDump?.id || null,
      summary: combinedSummary || analysis.summary || null,
      mood: analysis.mood || null,
      factsExtracted: profileUpdates.length + insights.length,
      topics,
    })
  } catch (error) {
    console.error('Brain dump complete API error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Completion failed' },
      { status: 500 }
    )
  }
}
