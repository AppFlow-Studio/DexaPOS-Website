import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

import { fillDateGaps } from '../analytics-primitives'

/**
 * Integration check against the real database, exercising the SHIPPED
 * `fillDateGaps` against what the deployed RPCs actually return.
 *
 * The unit tests next door pin the algorithm on synthetic input. This one
 * answers a different question: given today's production-shaped data, does the
 * chart end up drawing broken line segments rather than one continuous line
 * across a month-long hole?
 *
 * Skips itself when `.env` has no Supabase credentials, so it cannot fail a
 * checkout that has no database access.
 */
function credentials() {
  try {
    const env = Object.fromEntries(
      fs
        .readFileSync('.env', 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [
          l.slice(0, l.indexOf('=')).trim(),
          l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, ''),
        ])
    )
    const url = env.NEXT_PUBLIC_SUPABASE_URL
    const key = env.SUPABASE_SERVICE_ROLE_KEY
    return url && key ? { url, key } : null
  } catch {
    return null
  }
}

const creds = credentials()

describe.skipIf(!creds)('fillDateGaps against live analytics RPCs', () => {
  const sb = createClient(creds!.url, creds!.key)
  const p_from = new Date(Date.now() - 90 * 864e5).toISOString()
  const p_to = new Date().toISOString()

  for (const fn of ['get_avg_kitchen_time', 'get_avg_table_turn_time']) {
    it(`${fn}: produces line breaks and never a fabricated zero`, async () => {
      const { data, error } = await sb.rpc(fn, { p_from, p_to })
      expect(error).toBeNull()

      const rows = (data ?? []) as { date: string; avg_minutes: number | null }[]
      if (rows.length < 2) return

      const filled = fillDateGaps(rows, ['avg_minutes'])

      // The RPC omits unmeasurable days; the helper must restore the calendar.
      expect(filled.length).toBeGreaterThanOrEqual(rows.length)

      // Every inserted point is null — never 0, which would assert that food
      // came out instantly / tables turned instantly on a day with no data.
      const inserted = filled.filter(
        (r) => !rows.some((o) => o.date === r.date)
      )
      expect(inserted.every((r) => r.avg_minutes === null)).toBe(true)

      // No real datapoint was altered.
      for (const original of rows) {
        expect(filled.find((r) => r.date === original.date)?.avg_minutes).toBe(
          original.avg_minutes
        )
      }

      // The calendar is contiguous, so the x-axis is a true time scale.
      for (let i = 1; i < filled.length; i++) {
        const prev = Date.parse(filled[i - 1].date + 'T00:00:00Z')
        const cur = Date.parse(filled[i].date + 'T00:00:00Z')
        expect(cur - prev).toBe(86_400_000)
      }
    })
  }
})
