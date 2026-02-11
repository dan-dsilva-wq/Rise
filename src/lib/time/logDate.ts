const DEFAULT_RESET_HOUR = 4

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function getTimezoneParts(date: Date, timezone: string): {
  year: number
  month: number
  day: number
  hour: number
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value || '0')
  const month = Number(parts.find((part) => part.type === 'month')?.value || '0')
  const day = Number(parts.find((part) => part.type === 'day')?.value || '0')
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0')

  return { year, month, day, hour }
}

export function getHourForTimezone(timezone: string, now: Date = new Date()): number {
  return getTimezoneParts(now, timezone).hour
}

export function getLogDateForTimezone(
  timezone: string,
  options?: {
    now?: Date
    resetHour?: number
  }
): string {
  const now = options?.now ?? new Date()
  const resetHour = options?.resetHour ?? DEFAULT_RESET_HOUR
  const { year, month, day, hour } = getTimezoneParts(now, timezone)

  if (hour >= resetHour) {
    return formatDateParts(year, month, day)
  }

  // Before reset hour we treat this as the previous "day" for logs.
  const previousDay = new Date(Date.UTC(year, month - 1, day))
  previousDay.setUTCDate(previousDay.getUTCDate() - 1)
  return formatDateParts(
    previousDay.getUTCFullYear(),
    previousDay.getUTCMonth() + 1,
    previousDay.getUTCDate()
  )
}

export function getLogDateForLocal(options?: {
  now?: Date
  resetHour?: number
}): string {
  const now = options?.now ? new Date(options.now) : new Date()
  const resetHour = options?.resetHour ?? DEFAULT_RESET_HOUR
  if (now.getHours() < resetHour) {
    now.setDate(now.getDate() - 1)
  }

  return formatDateParts(now.getFullYear(), now.getMonth() + 1, now.getDate())
}
