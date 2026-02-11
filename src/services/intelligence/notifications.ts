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
  recentQuestionSent: Date[]
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
  inPreferredWindow: boolean
  currentWindow: 'morning' | 'late_evening' | 'none'
  sentTodayCount: number
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

function resolvePromptWindow(hour: number): 'morning' | 'late_evening' | 'none' {
  if (hour >= 9 && hour <= 11) return 'morning'
  if (hour >= 21 && hour <= 23) return 'late_evening'
  return 'none'
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
        .limit(20)
    ),
    getLastActivityAt(client, userId),
  ])

  const timezone = profileResult.data?.timezone || 'UTC'
  const recentQuestionSent = lastQuestionResult.data
    .map(row => row.sent_at)
    .filter((value): value is string => Boolean(value))
    .map(value => new Date(value))
    .filter(value => !Number.isNaN(value.getTime()))
  const sentAt = recentQuestionSent[0]

  return {
    userId,
    userTimezone: timezone,
    lastQuestionSent: sentAt ? new Date(sentAt) : null,
    recentQuestionSent,
    lastUserActivity,
    currentTime: new Date(),
  }
}

export function shouldSendQuestion(ctx: NotificationContext): NotificationDecision {
  const userHour = getHourInTimezone(ctx.currentTime, ctx.userTimezone)
  const currentWindow = resolvePromptWindow(userHour)
  const minutesSinceActivity = minutesBetween(ctx.lastUserActivity, ctx.currentTime)
  const hoursSinceActivity = hoursBetween(ctx.lastUserActivity, ctx.currentTime)
  const hoursSinceLastQuestion = ctx.lastQuestionSent
    ? hoursBetween(ctx.lastQuestionSent, ctx.currentTime)
    : null
  const todayKey = getDateKeyInTimezone(ctx.currentTime, ctx.userTimezone)
  const sentToday = ctx.recentQuestionSent.filter(
    sentAt => getDateKeyInTimezone(sentAt, ctx.userTimezone) === todayKey
  )
  const sentTodayCount = sentToday.length
  const sentMorningToday = sentToday.some(
    sentAt => resolvePromptWindow(getHourInTimezone(sentAt, ctx.userTimezone)) === 'morning'
  )
  const sentEveningToday = sentToday.some(
    sentAt => resolvePromptWindow(getHourInTimezone(sentAt, ctx.userTimezone)) === 'late_evening'
  )
  const inPreferredWindow = currentWindow !== 'none'
  const openedToday = hasOpenedAppToday(ctx.lastUserActivity, ctx.currentTime, ctx.userTimezone)

  if (minutesSinceActivity < 30) {
    return {
      shouldSend: false,
      reason: 'User has been active in the app within the last 30 minutes.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inPreferredWindow,
      currentWindow,
      sentTodayCount,
      openedAppToday: openedToday,
    }
  }

  if (userHour < 9 || userHour > 23) {
    return {
      shouldSend: false,
      reason: 'Current local time is outside 9am-11pm.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inPreferredWindow,
      currentWindow,
      sentTodayCount,
      openedAppToday: openedToday,
    }
  }

  if (sentTodayCount >= 2) {
    return {
      shouldSend: false,
      reason: 'Already sent two proactive questions today.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inPreferredWindow,
      currentWindow,
      sentTodayCount,
      openedAppToday: openedToday,
    }
  }

  if (!inPreferredWindow) {
    return {
      shouldSend: false,
      reason: 'Current local time is outside preferred morning/evening windows.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inPreferredWindow,
      currentWindow,
      sentTodayCount,
      openedAppToday: openedToday,
    }
  }

  if (currentWindow === 'morning' && sentMorningToday) {
    return {
      shouldSend: false,
      reason: 'Morning proactive question already sent today.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inPreferredWindow,
      currentWindow,
      sentTodayCount,
      openedAppToday: openedToday,
    }
  }

  if (currentWindow === 'late_evening' && sentEveningToday) {
    return {
      shouldSend: false,
      reason: 'Late-evening proactive question already sent today.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inPreferredWindow,
      currentWindow,
      sentTodayCount,
      openedAppToday: openedToday,
    }
  }

  if (hoursSinceLastQuestion !== null && hoursSinceLastQuestion < 6) {
    return {
      shouldSend: false,
      reason: 'Most recent proactive question was sent too recently.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inPreferredWindow,
      currentWindow,
      sentTodayCount,
      openedAppToday: openedToday,
    }
  }

  if (currentWindow === 'morning' && !sentMorningToday) {
    return {
      shouldSend: true,
      reason: 'Morning window is open and no morning proactive question has been sent yet.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inPreferredWindow,
      currentWindow,
      sentTodayCount,
      openedAppToday: openedToday,
    }
  }

  if (currentWindow === 'late_evening' && !sentEveningToday) {
    return {
      shouldSend: true,
      reason: sentTodayCount === 0
        ? 'Late-evening window fallback to ensure at least one daily proactive touchpoint.'
        : 'Late-evening window is open and evening proactive question has not been sent yet.',
      userHour,
      minutesSinceActivity,
      hoursSinceActivity,
      hoursSinceLastQuestion,
      inPreferredWindow,
      currentWindow,
      sentTodayCount,
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
    inPreferredWindow,
    currentWindow,
    sentTodayCount,
    openedAppToday: openedToday,
  }
}

