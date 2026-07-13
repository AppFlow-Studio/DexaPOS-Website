/**
 * QR-32 — Storefront payment-origin whitelist backfill.
 *
 * For every active online-ordering location (optionally scoped to one
 * merchant), merge the computed origin set into
 * `location_payment_devices.whitelist_origins`. Idempotent — re-running on
 * an already-synced location is a no-op.
 *
 * This only updates the LOCAL mirror. After this runs, ops must still
 * register any newly-listed origins in the NMI portal for Collect.js to
 * tokenize from them. See docs/RUNBOOK-PAYMENT-WHITELIST-SYNC.md.
 *
 * Usage:
 *   npx tsx scripts/backfill-storefront-whitelist.ts                  # all
 *   npx tsx scripts/backfill-storefront-whitelist.ts --merchant <id>  # scoped
 *   npx tsx scripts/backfill-storefront-whitelist.ts --dry-run        # preview only
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import {
  auditStorefrontWhitelist,
  bulkSyncStorefrontWhitelist,
} from '../lib/payments/storefront-whitelist'

const envPath = resolve(__dirname, '..', '.env')
try {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
} catch (e) {
  console.error(`[backfill] could not read ${envPath}:`, (e as Error).message)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('[backfill] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

function parseArgs(argv: string[]) {
  const args = { merchantId: undefined as string | undefined, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--merchant' || a === '-m') {
      args.merchantId = argv[++i]
    } else if (a === '--dry-run' || a === '-n') {
      args.dryRun = true
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE!)

  console.error(
    `[backfill] scope=${args.merchantId ?? 'all merchants'} dryRun=${args.dryRun}`,
  )

  if (args.dryRun) {
    const report = await auditStorefrontWhitelist(supabase as any, {
      merchantId: args.merchantId,
    })
    const needs = report.filter((r) => r.status === 'needs_sync')
    console.log('')
    console.log('DRY RUN — no writes performed.')
    console.log(`Would sync ${needs.length} of ${report.length} locations:`)
    for (const e of needs) {
      console.log(
        `  - location=${e.locationId} slug=${e.storeSlug ?? '(none)'} missing=${e.missing.length}`,
      )
    }
    return
  }

  const summary = await bulkSyncStorefrontWhitelist(supabase as any, {
    merchantId: args.merchantId,
  })

  console.log('')
  console.log('Backfill summary')
  console.log('================')
  console.log(`scanned:    ${summary.scanned}`)
  console.log(`updated:    ${summary.updated}`)
  console.log(`unchanged:  ${summary.unchanged}`)
  console.log(`errors:     ${summary.errors}`)
  console.log('')

  if (summary.errors > 0) {
    console.log('--- ERRORS ---')
    for (const { locationId, result } of summary.perLocation) {
      if (result.error) console.log(`  - location=${locationId}  error=${result.error}`)
    }
    console.log('')
  }

  if (summary.updated > 0) {
    console.log('--- LOCATIONS UPDATED (origins newly written to the LOCAL mirror) ---')
    for (const { locationId, result } of summary.perLocation) {
      if (result.synced && !result.skipped) {
        console.log(`  - location=${locationId}`)
        for (const o of result.origins) console.log(`      ${o}`)
      }
    }
    console.log('')
    console.log('NEXT STEP: register each newly-listed origin in the NMI portal.')
    console.log('See docs/RUNBOOK-PAYMENT-WHITELIST-SYNC.md §"How to mirror into the NMI portal".')
  } else {
    console.log('No locations needed updating.')
  }

  if (summary.errors > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error('[backfill] failed:', e)
  process.exit(1)
})
