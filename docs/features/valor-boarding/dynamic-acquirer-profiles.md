# Dynamic Valor Acquirer Profiles (per-merchant MID entry)

**Status:** In progress · **Owner:** HQ / Payments · **Rollout:** staging-first, no flags

## Problem

Valor boarding currently reads the acquirer MID/TID block from a single static env
var `VALOR_BOARDING_PROCESSOR_DATA` (`lib/payments/valor/boardingConfig.ts:readValorAcquirerConfig`).
That block flows unchanged into every `/create` (`boardingApi.ts:buildEpiData` →
`processorData[0].mid1`). Because `mid1` is the TSYS merchant number that identifies
the **settlement DDA**, every merchant boarded in production would settle to the
**same bank account**. That is a sandbox-only shortcut and a hard prod blocker.

We run the **traditional ISO/ISV** model (`VALOR_BOARDING_CREATE_VARIANT=traditionaltsys`,
`programType=2`), where each merchant is underwritten separately with its **own MID**
tied to its **own bank**, and Dexa earns the residual. So each merchant (optionally
each location) needs its own MID entered from underwriting before it can board.

## What stays in env vs what becomes per-merchant

The MID/TID block has "twin" keys; only the `1`-suffixed keys are populated today.

| Field (`processorData` key) | Scope | Source after this change |
|---|---|---|
| `mid1` | per-merchant (settlement) | **DB profile (vaulted)** |
| `vNumber1` | per-merchant | **DB profile (vaulted)** |
| `storeNo1` | per-merchant | **DB profile** |
| `termNo1` | per-merchant | **DB profile** |
| `binnumber1`, `agent1`, `agentBank1`, `chain1`, `association1`, `industry1`, EBT twins, `label` | ISO-level (Mtech program, same for all) | **env template (unchanged)** |
| `VALOR_ISO_*`, `VALOR_FEE_*`, `VALOR_BOARDING_ISV_USERNAME`, `createVariant`, `processor`, `programType`, `device` | ISO-level | **env (unchanged)** |

`loadAcquirerProfile()` merges the 4 DB identifiers over the env template:
`{ ...envTemplate.processorData, mid1, vNumber1, storeNo1, termNo1 }`.

## UI design (approved)

Container: **slide-over Sheet** (matches canonical `NewEditItemFormSheet`).
MID scope: **one MID, per-location opt-in** ("same for all locations" toggle, on by default).
Gate: reuse **`hq.merchant.update`** — no new permission code.

The `ValorBoardingSection` becomes a 3-step flow where Step 1 gates Step 2:

- **Step 1 · Processing credentials** — new prerequisite card.
  - *Not set:* amber, `[ Add processing credentials ]`; Board button disabled.
  - *Ready:* green `Ready ✓`, masked summary `MID ····3193 · V# ····1674 · Store 5999 · Term 1515`, `[ Edit ]`.
  - *Per-location partial:* `[ N location(s) need a MID ]` with per-location rows.
- **Step 2 · Board on Valor** — existing card; button disabled (with tooltip
  "Add processing credentials first") until Step 1 = Ready.
- **Step 3 · Per-location provisioning + Set live** — existing per-location cards.

**Sheet form:** only 4 fields visible (MID, V-Number, Store #, Terminal #), MID + V#
masked with reveal (`👁`, audit-logged on reveal). ISO template shown read-only under a
collapsed **"Acquiring program"** disclosure. Multi-location merchants get a
`☑ Use the same MID for all locations` toggle; unchecking reveals a MID block per
location. react-hook-form + Zod; one `sonner` toast; invalidates the boarding query.

## Backend design

### Table `valor_acquirer_profiles` (migration `20260915130000`)
```
id uuid pk
merchant_id uuid not null  → merchants(id) ON DELETE CASCADE
location_id uuid null       → locations(id) ON DELETE CASCADE  -- NULL = all locations (shared)
mid_secret_id     uuid not null   -- vault pointer (full MID)
vnumber_secret_id uuid not null   -- vault pointer (full V-Number)
mid_last_four      text not null  -- masked display
vnumber_last_four  text
store_no text not null
term_no  text not null
status text not null default 'ready' check (status in ('draft','ready'))
created_at / updated_at (update_updated_at_column trigger)
UNIQUE NULLS NOT DISTINCT (merchant_id, location_id)
```
RLS enabled; SELECT policy for `is_dexapos_admin()`; writes only via SECURITY DEFINER RPC.

### RPCs (mirror `board_persist_valor_account` — gated `service_role OR is_dexapos_admin()`)
- `save_valor_acquirer_profile(p_merchant_id, p_location_id, p_mid, p_vnumber, p_store_no, p_term_no)`
  → vault mid + vnumber (stable name `valor_acq_mid:{m}:{loc|global}` / `valor_acq_vnum:...`),
  compute last-4, upsert row, return id.
- `get_valor_acquirer_secrets(p_merchant_id, p_location_id)` → decrypted mid/vnumber + store/term
  (boarding path only). Falls back to the merchant-wide (NULL location) row when no
  per-location row exists.
- `delete_valor_acquirer_profile(p_merchant_id, p_location_id)` (optional; skip v1).

### Config assembly — `lib/payments/valor/boardingConfig.ts`
- `AcquirerIdentifiers { mid, vNumber, storeNo, termNo }`
- `applyAcquirerIdentifiers(base: ValorAcquirerConfig, ids): ValorAcquirerConfig`
  → returns base with `processorData` twin keys overridden. Pure + unit-tested.

### Server actions — `app/manage/actions/admin-merchant/valor.ts`
- `getMerchantAcquirerProfile(merchantId)` → masked `{ mode, locations:[{locationId,locationName,midLast4,vnumberLast4,storeNo,termNo,status}], sharedProfile, allCovered }` (`hq.merchant.view`).
- `saveMerchantAcquirerProfile(merchantId, input)` → per-location or shared; calls save RPC; audit-logged (`hq.merchant.update`).
- `revealAcquirerMid(merchantId, locationId?)` → decrypted MID for the Sheet reveal; audit-logged.

### Preflight wiring — `valor-board.ts`
Replace the env `acquirer` blocker with a DB check:
- Load profiles. No usable profile → blocker `acquirer_profile` ("Add processing credentials").
- Shared → build one `acquirer` (env template + shared identifiers).
- Per-location → build per-location `acquirer`; any active location missing one → blocker naming it.
- Thread per-location acquirer via new optional `LocationInput.acquirer?` (engine uses
  `location.acquirer ?? options.acquirer`). Shared path needs no engine change.

### Frontend
- `admin-keys.ts`: `merchantValorAcquirer(merchantId)`.
- `use-admin-valor-boarding.ts`: `useMerchantAcquirerProfile`, `useSaveMerchantAcquirerProfile`, `useRevealAcquirerMid`.
- `AcquirerProfileSheet.tsx` (new).
- `ValorBoardingSection.tsx`: Step 1 card + board gate + Sheet.

## Implementation checklist
- [x] Migration: `valor_acquirer_profiles` table + RLS + 2 RPCs + trigger (`20260915130000`)
- [x] `boardingConfig.ts`: `AcquirerIdentifiers` + `applyAcquirerIdentifiers` (+ unit test)
- [x] `boarding.ts` / `boardingApi.ts`: optional `LocationInput.acquirer` thread
- [x] Server actions: get / save / reveal (+ audit logs) — `valor-acquirer.ts`
- [x] `valor-board.ts`: DB-backed acquirer preflight + per-location acquirer build
- [x] admin-keys + query hooks
- [x] `AcquirerProfileSheet.tsx`
- [x] `ValorBoardingSection.tsx`: Step 1 + gate + Sheet
- [x] Apply migration to staging; regenerate `database.types.ts`
- [x] `npm run test` (Valor suites green; 12 unrelated pre-existing failures) + `eslint` clean
- [x] `npm run build` — succeeded (BUILD_EXIT=0), after clearing a full disk / 24 GB `.next`
- [ ] Staging E2E: enter creds → board a test merchant → verify MID reaches Valor (browser pass)

## Verification notes
- RPC round-trip proven on staging: `save_valor_acquirer_profile` → `get_valor_acquirer_secrets`
  returned the exact MID/V-Number (vault encrypt/decrypt works); test row cleaned up (0 rows left).
- Security advisor for the 2 new RPCs = one WARN (`authenticated_security_definer_function_executable`),
  identical to the existing `board_persist_valor_account` pattern (granted to `authenticated`,
  guarded internally by `is_dexapos_admin()`); no new ERROR; table RLS enabled.

## Rollout
Staging-first. Prod cutover = set `VALOR_ENV=production` + hosts (see the prod-migration
notes), enter each real merchant's underwriting MID via this UI, then Board.
The env `VALOR_BOARDING_PROCESSOR_DATA` remains as the ISO template.
