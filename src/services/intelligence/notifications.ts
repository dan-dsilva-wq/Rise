import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DbClient = SupabaseClient<Database>

interface SafeError {
  message?: string
}

interface SafeQueryResult<T> {
  data: T
  error: Error | null
}

function toClient(client: DbClient) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any
}

function isMissingRelationError(error: SafeError | null | undefined): boolean {
  if (!error?.message) return false
  const message = error.message.toLowerCase()
  return message.includes('relation') && message.includes('does not exist')
}

async function safeListQuery<T>(
  executor: () => Promise<{ data: T[] | null; error: SafeError | null }>,
  fallback: T[] = []
): Promise<SafeQueryResult<T[]>> {
  try {
    const { data, error } = await executor()
    if (error) {
      if (isMissingRelationError(error)) {
        return { data: fallback, error: null }
      }
      return { data: fallback, error: new Error(error.message || 'Query failed') }
    }
    return { data: (data || fallback) as T[], error: null }
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error : new Error('Query failed'),
    }
  }
}

async function safeMaybeSingleQuery<T>(
  executor: () => Promise<{ data: T | null; error: SafeError | null }>,
  fallback: T | null = null
): Promise<SafeQueryResult<T | null>> {
  try {
    const { data, error } = await executor()
    if (error) {
      if (isMissingRelationError(error)) {
        return { data: fallback, error: null }
      }
      return { data: fallback, error: new Error(error.message || 'Query failed') }
    }
    return { data: (data ?? fallback) as T | null, error: null }
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error : new Error('Query failed'),
    }
  }
}


export interface NotificationContext {
  userId: string
  userTimezone: string
  lastQuestionSent: Date | null
  lastUserActivity: Date
  currentTime: Date
}

export interface NotificationDecision {
  shouldSend: boolean
  reason: string
  userHour: number
  minutesSinceActivity: number
  hoursSinceActivity: number
  hoursSinceLastQuestion: number | null
  inIdealWindow: boolean
  openedAppToday: boolean
}

function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / (1000 * 60 * 60))
}

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / (1000 * 60))
}

function getHourInTimezone(date: Date, timezone: string): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).format(date)
    const parsed = Number.parseInt(formatted, 10)
    return Number.isFinite(parsed) ? parsed : date.getHours()
  } catch {
    return date.getHours()
  }
}

function getDateKeyInTimezone(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

function hasOpenedAppToday(lastActivity: Date, currentTime: Date, timezone: string): boolean {
  return getDateKeyInTimezone(lastActivity, timezone) === getDateKeyInTimezone(currentTime, timezone)
}

async function getLastActivityAt(client: DbClient, userId: string): Promise<Date> {
  const supabase = toClient(client)

  const [projectLogs, milestoneMessages, pathFinderMessages, dailyLogs] = await Promise.all([
    safeListQuery<{ created_at: string }>(() =>
      supabase
        .from('project_logs')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
    ),
    safeListQuery<{ created_at: string }>(() =>
      supabase
        .from('milestone_messages')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
    ),
    safeListQuery<{ created_at: string }>(() =>
      supabase
        .from('path_finder_messages')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
    ),
    safeListQuery<{ updated_at: string }>(() =>
      supabase
        .from('daily_logs')
        .select('updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
    ),
  ])

  const candidates = [
    projectLogs.data[0]?.created_at,
    milestoneMessages.data[0]?.created_at,
    pathFinderMessages.data[0]?.created_at,
    dailyLogs.data[0]?.updated_at,
  ]
    .filter(Boolean)
    .map(timestamp => new Date(timestamp as string))
    .filter(date => !Number.isNaN(date.getTime()))

  if (candidates.length === 0) {
    return new Date(0)
  }

  return candidates.sort((a, b) => b.getTime() - a.getTime())[0]
}

export async function buildNotificationContextForUser(
  client: DbClient,
  userId: string
): Promise<NotificationContext> {
  const supabase = toClient(client)

  const [profileResult, lastQuestionResult, lastUserActivity] = await Promise.all([
    safeMaybeSingleQuery<{ timezone: string }>(() =>
      supabase
        .from('profiles')
        .select('timezone')
        .eq('id', userId)
        .maybeSingle()
    ),
    safeListQuery<{ sent_at: string | null }>(() =>
      supabase
        .from('proactive_questions')
        .select('sent_at')
        .eq('user_id', userId)
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(1)
    ),
    getLastActivityAt(client, userId),
  ])

  const timezone = profileResult.data?.timezone || 'UTC'
  const sentAt = lastQuestionResult.data[0]?.sent_at

  return {
    userId,
    userTimezone: timezone,
    lastQuestionSent: sentAt ? new Date(sentAt) : null,
    lastUserActivity,
    currentTime: new Date(),
  }
}

export function shouldSendQuestion(ctx: NotificationContext): NotificationDecision {
  const userHour = getHourInTimezone(ctx.currentTime, ctx.userTimezone)
  const minutesSinceActivity = minutesBetween(ctx.lastUserActivity, ctx.currentTime)
  const hoursSinceActivity = hoursBetween(ctx.lastUserActivity, ctx.currentTime)
  const hoursSinceLastQuestion = ctx.lastQuestionSent
    ? hoursBetween(ctx.lastQuestionSent, ctx.currentTime)
    : null

  if (hoursSinceLastQuestion !== null && hoursSinceLastQuestion < 24) {
    return {
      shouldSend: false,
      reason: 'Last proactive question was sent less than 24 hours ago.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inIdealWindow: false,
      openedAppToday: hasOpenedAppToday(ctx.lastUserActivity, ctx.currentTime, ctx.userTimezone),
    }
  }

  if (minutesSinceActivity < 30) {
    return {
      shouldSend: false,
      reason: 'User has been active in the app within the last 30 minutes.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inIdealWindow: false,
      openedAppToday: hasOpenedAppToday(ctx.lastUserActivity, ctx.currentTime, ctx.userTimezone),
    }
  }

  if (userHour < 9 || userHour > 21) {
    return {
      shouldSend: false,
      reason: 'Current local time is outside 9am-9pm.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inIdealWindow: false,
      openedAppToday: hasOpenedAppToday(ctx.lastUserActivity, ctx.currentTime, ctx.userTimezone),
    }
  }

  const inIdealWindow =
    (userHour >= 9 && userHour <= 10) ||
    (userHour >= 14 && userHour <= 15) ||
    (userHour >= 19 && userHour <= 20)

  const openedToday = hasOpenedAppToday(ctx.lastUserActivity, ctx.currentTime, ctx.userTimezone)

  if (inIdealWindow && !openedToday) {
    return {
      shouldSend: true,
      reason: 'Ideal prompt window and user has not opened the app today.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inIdealWindow,
      openedAppToday: openedToday,
    }
  }

  if (hoursSinceActivity > 48) {
    return {
      shouldSend: true,
      reason: 'User has been inactive for more than 48 hours.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inIdealWindow,
      openedAppToday: openedToday,
    }
  }

  return {
    shouldSend: false,
    reason: 'No qualifying proactive trigger fired.',
    userHour,
    minutesSinceActivity,
    hoursSinceActivity,
    hoursSinceLastQuestion,
    inIdealWindow,
    openedAppToday: openedToday,
  }
}

