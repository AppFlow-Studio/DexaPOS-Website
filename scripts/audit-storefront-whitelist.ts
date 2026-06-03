/**
 * QR-32 — Storefront payment-origin whitelist audit.
 *
 * Reports every active online-ordering location and which expected origins
 * are missing from `location_payment_devices.whitelist_origins`. Use this
 * before QR launch (or any time `getStoreUrl()` / a `custom_domain` /
 * `NEXT_PUBLIC_APP_URL` changes) to know which locations still need their
 * origins registered in the NMI portal.
 *
 * The columns this script prints — `expected`, `current`, `missing` — are
 * exactly what ops needs to paste into the NMI tokenization-key allowed-
 * origins box. See docs/RUNBOOK-PAYMENT-WHITELIST-SYNC.md.
 *
 * Usage:
 *   npx tsx scripts/audit-storefront-whitelist.ts                 # all merchants
 *   npx tsx scripts/audit-storefront-whitelist.ts --merchant <id> # one merchant
 *   npx tsx scripts/audit-storefront-whitelist.ts --json          # JSON output
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { auditStorefrontWhitelist } from '../lib/payments/storefront-whitelist'

// Parse .env manually (matches scripts/backfill-orderout.ts convention).
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
  console.error(`[audit] could not read ${envPath}:`, (e as Error).message)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('[audit] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

function parseArgs(argv: string[]) {
  const args = { merchantId: undefined as string | undefined, json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--merchant' || a === '-m') {
      args.merchantId = argv[++i]
    } else if (a === '--json') {
      args.json = true
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE!)

  console.error(
    `[audit] scanning${args.merchantId ? ` merchant=${args.merchantId}` : ' all merchants'}…`,
  )

  const report = await auditStorefrontWhitelist(supabase as any, {
    merchantId: args.merchantId,
  })

  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }

  const needsSync = report.filter((r) => r.status === 'needs_sync')
  const noDevice = report.filter((r) => r.status === 'no_device')
  const upToDate = report.filter((r) => r.status === 'up_to_date')

  console.log('')
  console.log('Storefront payment-origin whitelist audit')
  console.log('==========================================')
  console.log(`scanned:     ${report.length}`)
  console.log(`up_to_date:  ${upToDate.length}`)
  console.log(`needs_sync:  ${needsSync.length}   (run scripts/backfill-storefront-whitelist.ts)`)
  console.log(`no_device:   ${noDevice.length}   (NMI device must be created first)`)
  console.log('')

  if (needsSync.length > 0) {
    console.log('--- LOCATIONS WITH MISSING ORIGINS ---')
    for (const entry of needsSync) {
      console.log('')
      console.log(`location:        ${entry.locationId}`)
      console.log(`merchant:        ${entry.merchantId ?? '(none)'}`)
      console.log(`slug:            ${entry.storeSlug ?? '(none)'}`)
      console.log(`custom_domain:   ${entry.customDomain ?? '(none)'}`)
      console.log(`last_synced_at:  ${entry.whitelistSyncedAt ?? '(never)'}`)
      console.log(`missing origins:`)
      for (const o of entry.missing) console.log(`  - ${o}`)
    }
    console.log('')
  }

  if (noDevice.length > 0) {
    console.log('--- LOCATIONS WITHOUT AN ACTIVE ONLINE-ORDERING DEVICE ---')
    console.log('(These cannot be synced until the NMI device is created. See HQ Online Ordering settings.)')
    for (const entry of noDevice) {
      console.log(`  - location=${entry.locationId} merchant=${entry.merchantId ?? '(none)'} slug=${entry.storeSlug ?? '(none)'}`)
    }
    console.log('')
  }

  if (needsSync.length === 0 && noDevice.length === 0) {
    console.log('Every location is up to date. QR-32 mirror is clean — ops still needs to confirm portal registration.')
  }
}

main().catch((e) => {
  console.error('[audit] failed:', e)
  process.exit(1)
})
