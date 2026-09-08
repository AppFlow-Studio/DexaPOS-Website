const DEFAULT_RETRY_DELAYS_DAYS = [1, 3, 5]

function configuredRetryDelays(): number[] {
  const configured = Deno.env.get('BILLING_RETRY_DELAYS_DAYS')
  if (!configured) return DEFAULT_RETRY_DELAYS_DAYS

  const parsed = configured
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0)

  return parsed.length > 0 ? parsed : DEFAULT_RETRY_DELAYS_DAYS
}

export function resolveSubscriptionRetrySchedule(
  attemptCount: number,
  now = new Date(),
): { nextRetryAt: string | null; retryExhaustedAt: string | null } {
  const delays = configuredRetryDelays()
  const retryDelayDays = delays[attemptCount - 1]

  if (!retryDelayDays) {
    return {
      nextRetryAt: null,
      retryExhaustedAt: now.toISOString(),
    }
  }

  return {
    nextRetryAt: new Date(
      now.getTime() + retryDelayDays * 24 * 60 * 60 * 1000,
    ).toISOString(),
    retryExhaustedAt: null,
  }
}
