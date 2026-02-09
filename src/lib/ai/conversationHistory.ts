import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { ANTHROPIC_SONNET_MODEL } from '@/lib/ai/model-config'

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface SummaryCacheRow {
  sourceHash: string
  sourceMessageCount: number
  summary: string
}

interface PrepareHistoryOptions {
  messages: ConversationMessage[]
  anthropic: Anthropic
  userId: string
  conversationKey: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any
}

interface PreparedHistoryResult {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  didSummarize: boolean
  usedCachedSummary: boolean
}

export const MAX_HISTORY_MESSAGES = 20
export const SUMMARY_THRESHOLD = 20

const SUMMARY_PROMPT = 'Summarize this conversation excerpt in 2-3 concise paragraphs. Focus on: decisions made, key context, open questions, and anything the user said they would come back to. Be factual and brief.'
const SUMMARY_MAX_TOKENS = 300

const summaryCache = new Map<string, SummaryCacheRow>()

function makeCacheKey(userId: string, conversationKey: string): string {
  return `${userId}:${conversationKey}`
}

function hashMessages(messages: ConversationMessage[]): string {
  const serialized = messages
    .map(message => `${message.role}:${message.content}`)
    .join('\n---\n')
  return createHash('sha256').update(serialized).digest('hex')
}

function toAnthropicMessages(messages: ConversationMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages.map(message => {
    if (message.role === 'assistant') {
      return { role: 'assistant', content: message.content }
    }

    if (message.role === 'system') {
      return { role: 'user', content: `[System context]\n${message.content}` }
    }

    return { role: 'user', content: message.content }
  })
}

async function readSummaryFromStore(
  userId: string,
  conversationKey: string,
  sourceHash: string,
  sourceMessageCount: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any,
): Promise<SummaryCacheRow | null> {
  const cacheKey = makeCacheKey(userId, conversationKey)
  const inMemory = summaryCache.get(cacheKey)
  if (
    inMemory &&
    inMemory.sourceHash === sourceHash &&
    inMemory.sourceMessageCount === sourceMessageCount
  ) {
    return inMemory
  }

  if (!supabase) return null

  try {
    const { data } = await supabase
      .from('conversation_summaries')
      .select('source_hash, source_message_count, summary')
      .eq('user_id', userId)
      .eq('conversation_key', conversationKey)
      .maybeSingle()

    if (!data) return null

    const row: SummaryCacheRow = {
      sourceHash: data.source_hash,
      sourceMessageCount: data.source_message_count,
      summary: data.summary,
    }

    summaryCache.set(cacheKey, row)

    if (row.sourceHash === sourceHash && row.sourceMessageCount === sourceMessageCount) {
      return row
    }

    return null
  } catch {
    return null
  }
}

async function writeSummaryToStore(
  userId: string,
  conversationKey: string,
  row: SummaryCacheRow,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any,
): Promise<void> {
  const cacheKey = makeCacheKey(userId, conversationKey)
  summaryCache.set(cacheKey, row)

  if (!supabase) return

  try {
    await supabase
      .from('conversation_summaries')
      .upsert({
        user_id: userId,
        conversation_key: conversationKey,
        source_hash: row.sourceHash,
        source_message_count: row.sourceMessageCount,
        summary: row.summary,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,conversation_key',
      })
  } catch {
    // Table can be absent in local/dev before migrations run.
    // In-memory cache still prevents repeated summarization during runtime.
  }
}

function extractTextBlocks(response: Anthropic.Messages.Message): string {
  return response.content
    .filter(block => block.type === 'text')
    .map(block => (block as Anthropic.TextBlock).text)
    .join('\n')
    .trim()
}

export async function prepareConversationHistory({
  messages,
  anthropic,
  userId,
  conversationKey,
  supabase,
}: PrepareHistoryOptions): Promise<PreparedHistoryResult> {
  const systemMessages = messages.filter(message => message.role === 'system')
  const baseConversation = messages.filter(message => message.role !== 'system')

  let finalConversation = baseConversation.slice(-MAX_HISTORY_MESSAGES)
  let didSummarize = false
  let usedCachedSummary = false

  if (baseConversation.length > SUMMARY_THRESHOLD) {
    const oldMessages = baseConversation.slice(0, -SUMMARY_THRESHOLD)
    const recentMessages = baseConversation.slice(-SUMMARY_THRESHOLD)

    const sourceHash = hashMessages(oldMessages)
    const cached = await readSummaryFromStore(
      userId,
      conversationKey,
      sourceHash,
      oldMessages.length,
      supabase,
    )

    let summaryText = cached?.summary?.trim() || ''
    usedCachedSummary = !!summaryText

    if (!summaryText) {
      const summaryResponse = await anthropic.messages.create({
        model: ANTHROPIC_SONNET_MODEL,
        max_tokens: SUMMARY_MAX_TOKENS,
        system: SUMMARY_PROMPT,
        messages: toAnthropicMessages(oldMessages),
      })

      summaryText = extractTextBlocks(summaryResponse)
      if (!summaryText) {
        summaryText = 'Earlier context was summarized, but no additional details were extracted.'
      }

      await writeSummaryToStore(
        userId,
        conversationKey,
        {
          sourceHash,
          sourceMessageCount: oldMessages.length,
          summary: summaryText,
        },
        supabase,
      )
    }

    const summaryMessage: ConversationMessage = {
      role: 'user',
      content: `[Earlier in this conversation]\n${summaryText}\n[End of summary - recent messages follow]`,
    }

    finalConversation = [summaryMessage, ...recentMessages]
    didSummarize = true
  }

  const finalMessages = [...systemMessages, ...finalConversation]
  return {
    messages: toAnthropicMessages(finalMessages),
    didSummarize,
    usedCachedSummary,
  }
}
