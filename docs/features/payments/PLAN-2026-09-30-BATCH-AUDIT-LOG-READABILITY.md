# Batch activity in the Audit Logs (HQ + merchant)

**Date:** 2026-09-30 · **Branch:** `feat/batch-audit-log-readability` · **Builds on:** PR #335 (`a7828c65`)

## Why

PR #335 made settlement/batch audit rows readable, but only in the HQ merchant-detail Activity Log
tab. This work carries the same presentation to the other views:

- the merchant **Activity Log** (`/dashboard/audit-logs`);
- the HQ **global Audit Logs** (`/manage/audit-logs`);
- the HQ **terminal page Activity tab**.

It also fixes terminal attribution. #335 read `metadata.payment_terminal_id`, which is set for too
few rows:

| Writer | Writes `payment_terminal_id`? |
|---|---|
| POS trigger (`_audit_settlement_batch_transition`) | Yes |
| Valor webhook (`record_valor_batch_webhook`) | No, never written |
| HQ `manualBatchout` | Written, but `sanitizeAuditRecord` strips every `*_id` key before it is stored |

**Staging baseline (2026-09-30):**
- Metadata attribution finds a terminal for 9 of 25 batch audit rows.
- Resolving through the batch FK (`audit_logs.resource_id` → `settlement_batches.payment_terminal_id`
  → `payment_terminals`) finds one for 23 of 25. The other 2 batch rows no longer exist.

## Design

- **Server-side resolution.**
  - `lib/audit/attach-settlement-terminals.ts` attaches `settlement_terminal` to each settlement row.
  - It uses the service-role client because `payment_terminals` RLS lets only merchant admins read it.
  - Scope stays tight: ids come from audit rows the caller's RLS already returned, and queries are
    filtered to the verified merchant.
- **Statuses:** `linked`, `not_recorded`, `terminal_missing`, `batch_missing`, `unavailable`. The
  helper never guesses a terminal.
- **Batch labels come from the batch row too** (`settlement_batch`: `batch_id`, `batch_number`,
  `acquirer`).
  - Writers disagree: the Valor webhook omits `acquirer` ("Batch 10" vs the POS's "Batch
    VALOR-10"), and pre-#335 HQ manual rows carry no batch at all.
  - Metadata is only used for batches that no longer exist.
- **One describer.** `lib/audit/settlement-activity.ts` (`describeSettlementActivity`) produces the
  title, sentence, highlight and detail rows. Every surface uses it:
  - through `buildAuditSentence` for the merchant page and the HQ global page;
  - directly for the HQ tab and the terminal page.
- **Wording from #335.**
  - "Linked terminal" means the reader linked to the batch, not the device that settled it.
  - "Batch net" is never called a bank deposit.

## Checklist

- [x] Types: `SettlementTerminalAttribution`, `SettlementBatchIdentity`, `settlement_terminal?` and
      `settlement_batch?` on `AuditLogWithLocation`; `settlement` in `CATEGORY_LABELS`/`CATEGORY_COLORS`
- [x] Pure resolvers `resolveAuditSettlementTerminals` and `resolveAuditSettlementBatches`, with tests
- [x] Server helper `attachSettlementTerminals` (chunked, fail-closed to `unavailable`)
- [x] `describeSettlementActivity` moved to `lib/audit/` and extended (auto-settle actions, details,
      sentence), with tests
- [x] `buildAuditSentence` settlement branch + icons + test
- [x] `GetAuditLogs` and `getPlatformAuditLogs` enrich rows
- [x] Merchant Activity Log: Batches tab, label/icon, batch details in dialog, `?category=batches`
- [x] Merchant Batches view: "Batch activity" link
- [x] HQ global Audit Logs: category label, batch details + terminal link, CSV terminal columns
- [x] HQ merchant tab: server attribution (drops client terminal lookup), CSV newline fix
- [x] HQ terminal page Activity tab: includes the terminal's batch events, readable titles
- [x] `manualBatchout`: drop the silently-stripped `payment_terminal_id` metadata key
- [x] Verification: vitest, tsc on changed files, staging data run (below)
- [ ] Browser walkthrough of the four surfaces (not done: Chrome automation unavailable in the build
      session)

## Verification (2026-09-30)

**Vitest**
- 43/43 in `lib/audit`, `lib/admin`, `lib/navigation`.
- Full suite: 16 failures, the same 16 as the unmodified base (2408 passed vs 2399 on base; none in
  audit, settlement or batch code).

**tsc**
- No new errors in changed files.
- Total went from 861 to 858, which removes the `settlement` gaps in `types/audit-log.ts`.
- Run with `f3e070f3`'s version of `MerchantSubscriptionOverviewCard.tsx`, because origin preview
  has a syntax error there.

**ESLint:** no new findings. The remaining items are pre-existing and only shifted line numbers.

**Staging data run** (`attachSettlementTerminals` → `buildAuditSentence` on merchant `2add44cb…`'s 25
settlement rows)
- 23 are `linked` and 2 are `batch_missing`.
- Every writer's rows for one batch share a label, e.g. batch VALOR-9 reads:
  - "Batch VALOR-9 needs settlement review" (POS)
  - "Batch VALOR-9 settled" (Valor webhook)
  - "Batch VALOR-9 marked settled by Dexa (manual reconciliation)" (HQ)
- Auto-settle alerts read "Auto-settle didn't run on CodePay (on-terminal)".

## Out of scope / follow-ups

- `record_valor_batch_webhook` still omits `payment_terminal_id`/`acquirer` from metadata. The FK
  resolution covers display, so no migration is needed now.
- The latest `flag_missed_auto_settlements` (`20260917120000`) dropped the `auto_settle_stuck`
  emission that `20260814173904` added.
- The HQ merchant tab's actor filter state is never passed to `useAuditLogs`.
