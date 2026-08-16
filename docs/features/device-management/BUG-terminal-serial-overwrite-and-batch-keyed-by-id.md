# BUG — Connected device overwrote an existing terminal's serial; settlement batches key on terminal `id` not serial

**Type:** Bug (data correctness / payments settlement + device registry)
**Surface:** `payment_terminals` registry, `settlement_batches` mirror, POS device pairing/connect flow. Visible on the POS ("S/N still waiting to be discovered", batch-out showing a *previous* terminal's open batch) and the HQ/merchant Devices tab.
**Severity:** High — mis-attributes card batches and funds across physically different devices. Can (a) strand an open batch on a device you're trying to retire and (b) merge fresh sales into a *settled* or *foreign* batch, so they never settle. Direct money-reconciliation impact.
**Found via:** `YALLAH HABIBI` — merchant `8b8750a5-96ae-4ab8-887c-4ca2bf8b6f71`, location `714c2c9d-45a2-4c87-9b0e-ba61254c8955`, station `088f73a4-b0cd-47c3-85f3-dfe0e657fc60`, 2026-08-13.
**Owner:** Payments / device registry.
**Status:** Prod **operationally hotfixed** (fresh terminal record created for the live device). Two permanent code fixes remain **OPEN** (see Proposed fix).

---

## Summary

The store swapped physical Castles card terminals. Instead of the new device getting its own `payment_terminals` row, the **existing terminal record's `serial_number` was overwritten in place** with the new device's serial (`0000191250210925`). Because settlement batches are keyed on the terminal **`id` (UUID)**, not the serial, the previous device's batch history — including a **stuck open batch of $496.91 / 23 txns that would not settle** — stayed glued to that same record and surfaced against the new serial. On the POS this showed as a device "waiting to be discovered" plus a batch-out screen pointing at the previous terminal's open batch.

Two independent defects combined:

1. **Silent serial overwrite** on device connect/registration — a physically *different* device reused an existing terminal row rather than creating a new one.
2. **Batch identity keyed on the mutable terminal `id`** rather than the physical serial (or TPN), so identity does not follow the physical device across record churn, and reusing a batch number on the same `id` merges sales into a pre-existing (even settled) batch.

---

## Symptom (as reported)

- POS showed the payment device as **"S/N still waiting to be discovered."**
- The **batch-out** section showed the **open batch of the *previous* terminal**.
- Card payments still authorized, but the batch could not be closed.

## Evidence (prod, at time of incident)

`payment_terminals` for the station had two rows plus a ghost:

| row | serial | is_active | castles counter | note |
|---|---|---|---|---|
| `456beb40-…` "0925" | `0000191250210925` | true | 94 | ran **all** history; **serial was overwritten** onto this row |
| `67741999-…` "Front" | `NULL` | false | 0 | half-registered ghost → "waiting to be discovered" |

`settlement_batches` for that terminal `id` (`456beb40-…`):

| batch_id | batch_number | status | txns | gross |
|---|---|---|---|---|
| `LAZY-TSYS-456beb40-…-001` | 001 | settled | 26 | $621.44 |
| `LAZY-TSYS-456beb40-…-002` | 002 | **open (stuck)** | 23 | $496.91 |

Batch 002 detail: `retry_count = 6`, Castles settlement return code **`E000000D`** (top-level) / **`E0000009`** (settle-info), terminal reports 23 txns / **$503.22** to settle (= $496.91 gross + $6.31 tips). All 23 `order_payments` are `is_settled = false`.

Corroborating the overwrite: two $0.01 test transactions run *that day* reported `batch_number = '001'` and **lazy-linked into the already-`settled` batch 001**, landing `is_settled = false` inside a closed batch — a live demonstration of defect #2.

## Root cause

### Defect 1 — serial overwritten in place on a different device

When a physically different Castles device connected/registered on the station, the flow **updated the existing `payment_terminals` row's `serial_number`** (and effectively its identity) instead of creating a new row for the new hardware. The previous device's real serial was lost, and its batch history was re-attributed to the new serial.

> The exact write path is not fully contained in this web repo — Castles device pairing + batch-out live partly in the POS tablet app and terminal firmware. Candidate web paths to audit: `adminUpdateTerminal` in `app/manage/actions/admin-merchant/payment-terminals.ts` (accepts `serial_number`), plus the terminal edit/connect UI currently in flight (`AddTerminalDialog.tsx`, `EditTerminalDialog.tsx`, `ConnectedTerminalsPanel.tsx`) and any POS-side device-pairing that writes `payment_terminals.serial_number`.

### Defect 2 — settlement batches keyed on terminal `id`, not serial

The lazy-link trigger `public._lazy_settlement_batch_link` groups an `order_payments` row into a `settlement_batches` row keyed on:

```
(payment_terminal_id, merchant_id, acquirer, batch_number)   -- payment_terminal_id = order_payments.terminal_id = payment_terminals.id (UUID)
```

Defined in `supabase/migrations/20260510192050_wave_b2_settlement_batches_unique_per_merchant.sql`; unique index `uq_settlement_batches_host_key`; the `ON CONFLICT` contract is pinned by `supabase/migrations/20260510210257_wave_h2_lazy_link_index_pin.sql`. Castles + Dejavoo only. `batch_id` format: `LAZY-<acquirer>-<terminal_uuid>-<batch_number>`.

Consequences of keying on the mutable UUID:
- Overwriting a row's serial keeps the old batches attached (they follow the `id`, not the physical device).
- Re-registering the same physical device under a new row (new `id`) **splits** one host batch lineage into two DB batches.
- Reusing a `batch_number` on the same `id` **merges** new sales into the existing row — including a `settled` batch — because the trigger reuses `v_existing_id` (it only skips when the existing batch status is `pending`/`settling`).

The acquirer (TSYS) batches per **physical terminal (serial/TPN)**, so the DB mirror should key the same way. The read side already does — `get_connected_terminals_by_serial` (`supabase/migrations/20260813184029_get_connected_terminals_by_serial.sql`) dedups by `serial_number` — but the **write/link path was never made serial-aware.** That inconsistency is the core defect.

### Downstream (separate) issue — the stuck batch

Batch 002 failing settlement with `E000000D`/`E0000009` after 6 retries is the reason the store swapped hardware in the first place. It is a **separate money problem** (TSYS host settlement) and is *not* fixed by either code change below. It needs a processor-portal check → reconcile-if-funded or force-settle. See [[project_batch_reconciliation_timeout_57014]] and [[project_valor_auto_batch_webhook]] for related batch-reconciliation patterns.

## Impact

- Card batches/funds mis-attributed across two physical devices at one merchant.
- $496.91 / 23-txn batch stranded on a device being retired.
- Fresh sales at risk of merging into a settled/foreign batch (observed with the $0.01 tests) → would report `settled` yet never actually fund.

---

## Immediate remediation (done in prod)

Rather than reuse the overwritten row, we gave the live device a **fresh terminal record** so its batches track from a clean UUID, and retired the old row (preserving its stuck batch for separate resolution):

1. Retire old row `456beb40-…`: `is_active = false`, `serial_number = NULL` (frees the partial unique index `uq_payment_terminals_location_serial` so the serial can move), `terminal_name = '0925 (retired)'`. Credentials/config left intact.
2. Insert a new row (new `id` = `2c809935-7b0e-49c0-a9dd-e4988f2e3aad`) copying `merchant_id, location_id, station_id, terminal_type, terminal_model, auth_key, register_id, api_environment, connection_type` from the old row, hard-setting `terminal_name='0925'`, `serial_number='0000191250210925'`; all other columns take defaults (`is_active=true`, `castles_txn_counter=0`, `castles_last_pos_txn_id='000000'`, etc.).
3. Delete the `Front` ghost (`67741999-…`, NULL serial, no txns/batches).

**Verified live:** the new device opened its **own** batch `LAZY-TSYS-2c809935-…-002` even though it reused batch number `002` — completely separate from the old stuck `LAZY-TSYS-456beb40-…-002`. Same batch number, different UUID → different batch. Proof that a new record isolates cleanly under the *current* id-based scheme.

**Useful schema facts for any create-new-record fix:**
- `payment_terminals` NOT NULL cols: `id, merchant_id, location_id, terminal_name, castles_txn_counter, castles_last_pos_txn_id (default '000000'), castles_port (default 8080)`.
- Unique indexes: PK `id`; `uq_payment_terminals_location_serial (location_id, serial_number) WHERE serial_number IS NOT NULL` (partial — NULL serial escapes it); `uq_tpn_per_merchant (merchant_id, tpn)`.

---

## Proposed fix (permanent — OPEN)

### Fix 1 — Never overwrite a terminal's serial with a different device's serial

On device connect / registration / edit, treat the **serial as the physical-device identity**:

- If an incoming connected device reports a `serial_number` that **differs** from the stored row's serial for that station/slot, do **not** update the existing row. Instead **create a new `payment_terminals` row** for the new hardware (new UUID) and retire/unlink the old one — or, in an admin edit context, block the change and surface a "this looks like a different device (S/N X ≠ Y) — register as new?" confirmation.
- Only allow serial to be *filled in* when it was `NULL` (first-time discovery), never *changed* from one non-null serial to a different non-null serial silently.
- Reuse the existing S/N-aware read model (`get_connected_terminals_by_serial`, incl. its `duplicate_serial` flag) to detect/warn on mismatches and duplicates in the UI (`ConnectedTerminalsPanel`).
- Audit and guard every write path that sets `payment_terminals.serial_number`: `adminUpdateTerminal` / `adminCreateTerminal` in `app/manage/actions/admin-merchant/payment-terminals.ts`, the in-flight `AddTerminalDialog`/`EditTerminalDialog`, and the POS-side device-pairing writer.

### Fix 2 — Key settlement batches on serial (or TPN), not `id`

Re-key `_lazy_settlement_batch_link` + `uq_settlement_batches_host_key` from `payment_terminal_id` to the physical **`serial_number`** (TPN is the stricter host key; pick per acquirer), so batch identity follows the device across record churn and matches how TSYS batches.

Implementation notes / gotchas:
- **Serial resolution:** `order_payments.terminal_id` carries the terminal **UUID**, not the serial. The trigger must `JOIN payment_terminals` (by that UUID) to resolve `serial_number`. Consider persisting the serial onto `settlement_batches` (and/or `order_payments`) at link time.
- **NULL-serial fallback:** during the "waiting to be discovered" window a terminal has no serial. The trigger needs a defined fallback (skip link, or fall back to UUID) or those payments can't be keyed.
- **Index/contract:** replace `uq_settlement_batches_host_key` columns with the serial-based tuple `(serial_number, merchant_id, acquirer, batch_number)` and **re-pin** the `wave_h2_lazy_link_index_pin` `ON CONFLICT` contract, or concurrent inserts raise "no unique or exclusion constraint matching the ON CONFLICT specification."
- **Migrate history first:** resolve/close any open stuck batches (e.g. the $496.91 one) **before** switching to serial keying, or previously-`id`-separated batches sharing a serial would re-merge. (In this incident the retired row's serial is now `NULL`, so it won't collide — but that's incidental, not a general guarantee.)
- Ship **staging-first**, validate, then promote (see [[feedback_rollout_strategy]]).

---

## Verification / QA (for the permanent fixes)

- Connect a device whose serial differs from the stored row → assert a **new** `payment_terminals` row is created (or the edit is blocked), old serial preserved, no in-place overwrite.
- First-time discovery (stored serial `NULL`) → serial fills in, no new row.
- With serial-keyed batches: a device re-registered under a new UUID but same serial → its sales link to the **same** batch lineage (by serial), not a split one.
- Same physical device reusing a `batch_number` → does not merge into a `settled`/foreign batch.
- Backfill/repair check: no `order_payments` linked to a `settled` batch with `is_settled = false`.

## Open questions / follow-ups

- Confirm the exact write path that overwrote the serial (POS tablet pairing vs. admin edit) and gate it (Fix 1).
- Serial vs. TPN as the batch key — TPN is closer to the true host batch identity; decide per acquirer (Castles/TSYS vs. Valor/Dejavoo).
- Resolve the stranded `456beb40-…` batch 002 ($496.91): verify with TSYS whether it funded → reconcile-as-settled or force-settle.
- Reconcile the two stray $0.01 test payments mis-linked to settled batch 001.

## References

- Trigger/index: `supabase/migrations/20260510192050_wave_b2_settlement_batches_unique_per_merchant.sql`, `supabase/migrations/20260510210257_wave_h2_lazy_link_index_pin.sql`
- S/N-aware read model: `supabase/migrations/20260813184029_get_connected_terminals_by_serial.sql`
- Terminal admin actions: `app/manage/actions/admin-merchant/payment-terminals.ts`
- Terminal UI (in flight): `app/manage/merchants/[merchantId]/components/{AddTerminalDialog,EditTerminalDialog,ConnectedTerminalsPanel,DevicesTab}.tsx`
- Related batch-reconciliation issues: `docs/VALOR-WEBHOOK-AUTO-BATCH-SETUP-AND-FLOW.md`
