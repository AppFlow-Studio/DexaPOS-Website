# Castles Auto-Batch — Flow, Tablet Contract & Production Hardening

**Status:** Design + hardening plan. **Scope:** Castles semi-integrated terminals (LAN-local).
**Key difference vs Valor:** Castles has **no cloud webhook**. Settlement is **POS-command-driven over the LAN** —
the POS tablet sends the settle command to the terminal, then reports the result back. There is no server-to-server
path, so **the tablet must be on at `settle_time`** for a scheduled Castles batch to fire.

Companion: `docs/VALOR-WEBHOOK-AUTO-BATCH-SETUP-AND-FLOW.md` (the opposite model — terminal + cloud webhook, POS-independent).

---

## 1. The flow (trigger → prepare → terminal → finalize → cascade → reconcile)

```
settle_time (location tz)          [POS TABLET — separate RN repo]
        │
        ▼  prepare_castles_settlement(terminal_id, merchant_id, initiated_by)
   ┌────────────────────────────────────────────────────────────────┐
   │ • FOR UPDATE lock on the terminal row (serializes prepares)      │
   │ • BLOCK if a batch is already 'pending'/'settling' (in-flight)   │
   │ • auto-reset any 'pending' batch >10 min old → 'failed' (safe)   │
   │ • pin unsettled captured Castles payments into a NEW batch       │
   │   (host-keyed if acquirer+batch_number known, else DEXA-keyed)   │
   │ • bump castles_last_pos_txn_id (mod 999999) → unique txn id      │
   │ • batch.status = 'pending'; returns {batch_uuid, castles_request}│
   └────────────────────────────────────────────────────────────────┘
        │
        ▼  [tablet → terminal over LAN]  send settle {txnPosTxnId, txnType:'settlement'}
        │
        ▼  [terminal closes batch on host, returns txnReturnCode / txnBatchNum / txnSettleInfo]
        │
        ▼  finalize_castles_settlement(batch_uuid, merchant_id, response)
   ┌────────────────────────────────────────────────────────────────┐
   │ • FOR UPDATE lock on the batch                                   │
   │ • already-settled + good response → idempotent no-op (success)   │
   │ • per-acquirer parse: all '00000000' → settled; mixed → partial  │
   │   'E000002A' → retry; else → failed                             │
   │ • settled/partial → stamp closed_at/settlement_date, flip        │
   │   is_settled on linked payments                                  │
   │ • retry/failed → host-keyed batch back to 'open', else unlink    │
   └────────────────────────────────────────────────────────────────┘
        │
        ▼  trg_cascade_is_settled_on_batch_close → is_settled=true on all linked payments
        ▼  Batch Reconciliation dashboard shows the batch (reconcile vs Tsys)
```

Source: `supabase/migrations/20260510204214_wave_g1_review_must_fixes.sql` (live `prepare_*`/`finalize_*`),
`20260510195909` (cascade), `20260510210257` (lazy-link, keys Castles by terminal+acquirer+batch_number).

---

## 2. What is already solid (idempotency / double-settle guards)

These are in the live RPCs and are production-grade:

- **Terminal lock** — `SELECT … FOR UPDATE` on the terminal serializes concurrent `prepare` calls (two tablets can't both open a batch).
- **In-flight guard** — `prepare` raises if a batch is `pending`/`settling`. One settle in flight per terminal.
- **Stale auto-reset** — a `pending` batch older than 10 min is auto-failed on the next `prepare`, releasing the terminal (covers app crash between prepare and finalize).
- **Soft-idempotent finalize** — finalizing an already-settled batch with a *successful* response is a no-op success; with a *failed* response it raises (blocks blind replay of a failure).
- **Failure rollback** — `retry`/`failed` returns a host-keyed batch to `open` (re-preparable) or unlinks a DEXA-keyed batch's payments so they re-settle cleanly.
- **Unique POS txn id** — `castles_last_pos_txn_id` (mod 999999) gives each settle command a unique id the terminal validates against replay.

**Verdict:** the backend settle contract is prod-ready. The bulletproofing work is (a) the tablet scheduler, (b) detection/recovery when the tablet is off/fails, (c) provenance + observability, and (d) the host-auto-batch question in §5.

---

## 3. The POS tablet contract (separate RN repo — MUST implement)

The tablet owns the trigger and the terminal I/O. To be bulletproof it must:

1. **Schedule in the location's timezone.** Resolve `settle_time` against `locations.timezone` (not device tz) so a traveling/mis-set tablet doesn't settle early. Fire once per business day per `auto_settle=true` terminal.
2. **Pass provenance.** Call `prepare_castles_settlement(…, p_initiated_by => 'pos_auto')` for scheduled runs (vs a user id for manual). The backend maps this to `settlement_batches.origin` (see §4).
3. **Handshake + state.** Persist `{batch_uuid, status}` locally between `prepare` and `finalize` so a crash/restart can resume rather than re-prepare. On boot, look for an un-finalized `pending` batch for the terminal and finalize/reconcile it.
4. **Retry with backoff.** If the terminal is unreachable, retry the settle a few times (e.g. 3× over a few minutes). The in-flight guard + 10-min stale-reset make a clean retry safe. Do **not** blind-retry `finalize` after a success — treat a lost response as "verify current batch status" first.
5. **Catch-up on boot.** If the tablet was off at `settle_time`, run the settle when it next comes on (the fallback path sweeps *all* unsettled captured payments, so nothing is lost — only delayed).
6. **Report outcome.** Surface success/failure to the merchant; a failed auto-settle should be visible on the tablet, not silent.

---

## 4. Provenance + observability (backend — BUILT, staging-verified)

- **`origin` stamping — DONE** (`20260814174415_castles_settle_origin_stamp.sql`). `prepare_castles_settlement` maps `p_initiated_by IN ('pos_auto','scheduler','auto') → origin='pos_auto'`, else `'pos_manual'`, on both the host-keyed UPDATE and the fallback INSERT. Backward-compatible (existing callers → `pos_manual`). Verified: a `pos_auto` prepare stamps `origin='pos_auto'`. Column + reconciliation badge already exist (`settlement_batches.origin`, `20260813220059`). **Tablet action:** pass `p_initiated_by => 'pos_auto'` for scheduled runs.
- **Missed / stuck detection — DONE** (`20260814173904_watchdog_flag_stuck_batches.sql`). The hourly watchdog now flags `auto_settle_missed` (no successful batch today) **and** `auto_settle_stuck` (a batch stuck in `pending`/`settling` past `settle_time+grace` — a prepare that never finalized). Verified both classifications on staging.
- **Attempt log — DONE** (`20260814174123_settlement_attempts_log.sql`). `settlement_attempts` table + `log_settlement_attempt(terminal, phase, outcome, detail, batch_uuid, initiated_by)` RPC. The tablet logs each phase (`prepare` / `terminal_command` / `finalize`) and outcome (`started`/`success`/`failed`/`timeout`/`blocked`); the RPC derives merchant/location/processor/origin from the terminal. Read-restricted to merchant admins + HQ. This captures the failures that never reach a batch outcome (prepare raised, terminal unreachable).

---

## 5. Batch-close model — DECIDED: POS-command-only

**Confirmed (2026-08-14):** the production Castles terminals close their batch **only when the POS sends the settle
command** — the processor does **not** host-auto-close. Therefore:

- Tablet scheduler + watchdog + retry is the **complete** model. A tablet-off is a *delayed* settle, fully
  recoverable on next boot (the fallback path sweeps all unsettled captured payments). **No reconciliation /
  settlement-report import is needed.**
- (For the record: had Tsys host-auto-closed, we'd have needed a Castles reconciliation path like Valor's webhook,
  because there's no cloud path to hear about a host-side close. That scenario is ruled out for these terminals.)

---

## 6. Production readiness checklist

- [x] **§5 answered** — POS-command-only (no Tsys host-auto-close). No reconciliation path needed.
- [x] `origin` stamping in `prepare_castles_settlement` — done, staging-verified.
- [x] Watchdog flags stuck `pending`/`settling` batches (§4) — done, staging-verified.
- [x] `settlement_attempts` log + `log_settlement_attempt()` RPC — done, staging-verified.
- [ ] **Tablet scheduler** implemented per §3 (RN repo) — tz-correct, retry, boot catch-up, `initiated_by='pos_auto'`, and calls `log_settlement_attempt()` at each phase. *(The one remaining piece; lives in the separate repo.)*
- [ ] Ops runbook: what to do on an `auto_settle_missed` / `auto_settle_stuck` alert (re-settle from tablet, or HQ `manual_mark_batch_settled` after verifying against the Tsys portal).
- [ ] Prod promotion: db-push the Aug-14 migrations + retest.
