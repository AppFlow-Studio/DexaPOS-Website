// TEMP seed/cleanup script for Landi Connect E2E review. Safe to delete.
// Usage: node _tmp-seed-device.mjs seed | node _tmp-seed-device.mjs cleanup
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing supabase env')

const supabase = createClient(url, key, { auth: { persistSession: false } })
const SERIAL = 'ZZTEST-LANDI-0001'
const CATALOG_ID = '303b387e-72ab-498e-bdf4-bb5fdfe17a4e' // Landi C20 PRO, pos_tablet
const mode = process.argv[2]

if (mode === 'cleanup') {
  const { error, count } = await supabase
    .from('device_inventory')
    .delete({ count: 'exact' })
    .eq('serial_number', SERIAL)
  if (error) throw error
  console.log(JSON.stringify({ deleted: count }))
} else {
  const { data, error } = await supabase
    .from('device_inventory')
    .insert({
      catalog_id: CATALOG_ID,
      serial_number: SERIAL,
      status: 'in_warehouse',
      firmware_version: '1.4.2',
      app_version: '3.9.0',
      condition: 'new',
      notes: 'TEMP E2E test row for Landi Connect review — safe to delete',
      created_by: 'e2e-review',
    })
    .select('id, serial_number, status')
    .single()
  if (error) throw error
  console.log(JSON.stringify(data))
}
