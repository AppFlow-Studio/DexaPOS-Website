const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_IN_MS = 24 * 60 * 60 * 1000

type DateOnlyParts = {
  year: number
  month: number
  day: number
}

export type MonthlyBillingPeriod = {
  startDate: string
  endDate: string
}

function parseDateOnly(value: string, fieldName: string): DateOnlyParts {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`)
  }

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} must be a valid calendar date.`)
  }

  return { year, month, day }
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function deriveMonthlyPeriodEnd(startDate: string): string {
  const start = parseDateOnly(startDate, 'Current period start')
  const targetMonthIndex = start.month
  const targetYear = start.year + Math.floor(targetMonthIndex / 12)
  const targetMonth = targetMonthIndex % 12
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const nextAnniversary = new Date(
    Date.UTC(targetYear, targetMonth, Math.min(start.day, lastTargetDay)),
  )

  return formatDateOnly(new Date(nextAnniversary.getTime() - DAY_IN_MS))
}

export function resolveMonthlyBillingPeriod(
  startDate: string,
  endDate?: string | null,
): MonthlyBillingPeriod {
  const start = parseDateOnly(startDate, 'Current period start')
  const normalizedStart = formatDateOnly(
    new Date(Date.UTC(start.year, start.month - 1, start.day)),
  )

  if (!endDate) {
    return {
      startDate: normalizedStart,
      endDate: deriveMonthlyPeriodEnd(normalizedStart),
    }
  }

  const end = parseDateOnly(endDate, 'Current period end')
  const normalizedEnd = formatDateOnly(
    new Date(Date.UTC(end.year, end.month - 1, end.day)),
  )

  if (normalizedEnd < normalizedStart) {
    throw new Error('Current period end cannot be before the period start.')
  }

  return {
    startDate: normalizedStart,
    endDate: normalizedEnd,
  }
}
