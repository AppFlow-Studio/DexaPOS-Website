# Valor Webhook — Auto-Batch Setup & Flow (Staging)

**Status:** Receiver BUILT (staging-verified). **Scope:** staging only, device **S/N NCC804380219** (auto-batch 7:00 PM).
**Deliverable type:** the `valor-webhook` edge function + `record_valor_batch_webhook()` RPC now implement §3/§5
(migration `20260813220059_valor_batch_webhook.sql`, RPC verified end-to-end on staging). Remaining manual steps:
set `VALOR_WEBHOOK_SECRET`, complete §2 in the Valor dashboard, and populate `valor_epi` on the terminal (§7).
**Docs source:** <https://valorapi.readme.io/reference/webhook-user-guide>

---

## 1. Overview & the gap

Valor terminal settlement in this codebase is **POS-initiated and synchronous**:

1. POS calls `prepare_valor_settlement()` — pins the unsettled captured Valor payments into a new
   `settlement_batches` row (`status='pending'`).
2. The terminal settles on-device (TRAN_MODE 0 / TRAN_CODE 9).
3. POS calls `finalize_valor_settlement()` — marks the batch `settled` and flips the pinned payments to
   `is_settled=true`.

See `supabase/migrations/20260723170000_valor_settlement_rpcs.sql`.

**An auto-batch is different.** The 7:00 PM auto-batch is a **Valor / terminal-side setting** — the device
closes its own batch on the host nightly and the POS **never calls the settlement RPCs**. Today that means:

- Valor `order_payments` receive a `batch_number` at capture (stamped from `valor_transaction.batchNumber`
  in `process_payment_v17_valor.sql:642-654`), but **no `settlement_batches` row is created** — the
  lazy-link trigger `_lazy_settlement_batch_link()` only runs for `terminal_type IN ('castles','dejavoo')`
  and explicitly returns early for Valor (`20260510210257_wave_h2_lazy_link_index_pin.sql:50`).
- Those payments stay `is_settled=false` forever and never appear reconciled in the **Batch Reconciliation**
  dashboard (`app/manage/transactions/components/BatchReconciliationSection.tsx`).

Valor's webhook system closes this gap: on **any** batch close — including an auto-batch — it emits a
`batch_summary` event (and, if subscribed, `batch_detail`), keyed on the device **EPI**, with a
`trigger_source` that flags **Auto Batch** vs **Manual Batch**. A receiver that turns that event into a
closed `settlement_batches` row lets the existing reconciliation machinery do the rest.

| | **Today (no webhook)** | **With the webhook receiver** |
|---|---|---|
| `settlement_batches` row for the auto-batch | none | created + `status='settled'` |
| `order_payments.is_settled` | stays `false` | flipped `true` by the cascade trigger |
| Batch Reconciliation dashboard | payments never reconcile | batch shows with discrepancy check |
| Who triggers it | nobody (POS never runs settle) | Valor pushes at 7:00 PM |

---

## 2. Valor-side setup (staging)

1. **Enable webhooks on the account.** Email **isvsupport@valorpaytech.com** to turn on Webhook support for
   the staging/UAT account (webhooks are off by default).
2. **Register the endpoint URL** in the Valor / ISV dashboard. This is the future staging edge-function URL:

   ```
   https://<staging-project-ref>.supabase.co/functions/v1/valor-webhook
   ```

   (Placeholder until the receiver is deployed. Staging project ref = `dfwqakoyittmrwbqvxgw`.)
   The dashboard validates the URL; duplicate URLs are allowed.
3. **Subscribe the events.** Entity **Settlement / Transaction**, action types:
   - **SUMMARY** → `batch_summary` (batch-level totals) — required.
   - **DETAIL** → `batch_detail` (per-transaction rows) — required for line-level matching.
   - Other actions (`AUTHCAPTURE`, `AUTHDECLINED`, `VOIDED`, `RETURN`, `APPROVED`, `TICKET`, `VAULT`, …)
     are **out of scope** for this pass.
4. **Enable HMAC-SHA256 auth** (Settings → Webhook Configuration). A secret key is auto-generated — copy it;
   it becomes the edge-function env var **`VALOR_WEBHOOK_SECRET`**. Regenerating the key requires updating
   that env var. See §6.
5. **Delivery contract:** Valor retries a failed delivery a **maximum of 3 times**, each with a **2-second
   timeout**. The receiver must therefore **ack 2xx quickly** and be **idempotent** (a redelivered
   `batch_summary` must be a no-op).

---

## 3. Auto-batch rules & flow

**The 7:00 PM auto-batch time is a device/host parameter set on the Valor side** — it is not configured
anywhere in this codebase. Our system's only role is to receive and reconcile the resulting webhook.

End-to-end sequence:

```
  7:00 PM
     │  terminal (S/N NCC804380219) closes its open batch on the Valor host
     ▼
  Valor  ──POST batch_summary (+ batch_detail)──►  valor-webhook edge fn
     │        headers: Valor-Signature, Valor-Timestamp                │
     │                                                                 ▼
     │                                              1. verify HMAC-SHA256 (§6)
     │                                              2. lookup terminal by EPI:
     │                                                 epi_id → payment_terminals.valor_epi
     │                                              3. find-or-create Valor settlement_batches
     │                                                 row (batch_no), status='settled'
     │                                              4. link the batch's order_payments
     │                                                 (terminal_id + batch_number)
     ▼                                                        │
  ack 2xx (≤2s)                                               ▼
                                         trg_cascade_is_settled_on_batch_close
                                         flips is_settled=true + settled_at on
                                         every linked order_payments row
                                                              │
                                                              ▼
                                    get_admin_settlement_batches() → Batch
                                    Reconciliation dashboard (no UI change)
```

Key points:

- **`trigger_source`** on the payload distinguishes an auto-batch (**"Auto Batch"**) from a manual one
  (**"Manual Batch"**). Persist it in `settlement_batches.raw_response` for audit / triage.
- **Step 5 reuses existing rails.** `_cascade_is_settled_on_batch_close()`
  (`20260510195909_wave_f1_cascade_is_settled_on_batch_close.sql`) is an `AFTER INSERT OR UPDATE OF status`
  trigger: when a batch enters `settled`/`closed`/`funded` it flips `is_settled=true` + stamps `settled_at`
  on all `order_payments WHERE settlement_batch_id = <batch>`. Its own comment states it exists to
  "bridge … external batch-outs" — i.e. this webhook path is exactly what it was built for.
- **No dashboard change needed.** `get_admin_settlement_batches()`
  (`20260510201336_admin_batch_rpcs_use_batch_number.sql`) already joins batches to payments on
  `COALESCE(op.batch_number, op.dejavoo_batch_number) = b.batch_number`, and its acquirer guard
  (`b.acquirer IS NULL OR op.acquirer IS NULL OR …`) passes for Valor (acquirer is NULL on both sides).

---

## 4. Event field reference

### 4.1 `batch_summary` (`data` object)

| Field | Type | Notes |
|---|---|---|
| `batches_id` | int | Valor internal batch id |
| `epi_id` | string | **device EPI — the join key to our terminal** |
| `batch_no` | int | host/acquirer batch number |
| `batch_opened_at` / `batch_closed_at` | datetime | batch window |
| `total_debit_amount` / `total_credit_amount` | numeric | |
| `total_ebt_cash_amount` / `total_ebt_food_amount` / `total_ebt_voucher_amount` | numeric | |
| `total_gift_amount` / `total_other_amount` | numeric | |
| `purchase_amount` | numeric | gross sales |
| `void_amount` / `refund_amount` / `auth_amount` | numeric | |
| `cash_purchase_amount` / `cash_refund_amount` / `cashback_amount` | numeric | |
| `tip_count` / `tip_amount` | int / numeric | |
| `fee_count` / `fee_amount` / `surcharge_fee_amount` / `merchant_fee_amount` | int / numeric | |
| `tax_amount` / `city_tax_amount` / `state_tax_amount` / `reduced_tax_amount` | numeric | |
| `cash_withdrawal_amount` / `cash_discount_amount` | numeric | |
| `gift_add_value_amount` / `gift_sale_amount` / `gift_tip_amount` | numeric | |
| `vpid` | int | |
| `created_at` / `modified_at` | datetime | |
| `trigger_source` | string | **"Auto Batch" / "Manual Batch"** |
| `summary_url` | URL | hosted summary |

### 4.2 `batch_detail` (array of transaction rows)

`txn_id`, `epi_id`, `device_app_version`, `txn_type`, `txn_type_code`, `amount`, `tip_amount`,
`cashback_amount`, `custom_fee_amount`, `surcharge_fee_amount`, `merchant_fee_amount`, `tax_amount`,
`city_tax_amount`, `state_tax_amount`, `tran_no`, `stan_no`, `device_identifier`, `invoice_no`, `batch_no`,
`masked_card_no`, `card_type`, `card_scheme`, `mcc`, `request_date`/`request_time`,
`response_date`/`response_time`, `approval_code`, `response_code`, `rrn`, `settled_at`, `created_at`,
`modified_at`, `request_recv_at`, `response_sent_at`, `store_number`, `agent_bank_number`, `timezone`,
`refunded_amount`, `reduced_tax_amount`, `food_balance_amount`, `food_amount`, `ebt_approval_code`,
`tip_fee_amount`, `is_voided`, `is_reversed`, `display_message`, `card_holder_name`, `net_amount`,
`tax_fee_amount`, `receipt_url`, `trigger_source`.

> Note: `batch_summary` carries `epi_id` but **not** the serial number. `batch_detail` rows carry
> `device_identifier` (which may be the serial) — but the terminal→merchant resolution is always done via
> `epi_id → valor_epi`, not the serial. See §7.

---

## 5. Field mapping → Dexa schema

**`batch_summary` → `settlement_batches` / `payment_terminals`**

| Valor | Dexa target | Notes |
|---|---|---|
| `epi_id` | `payment_terminals.valor_epi` | resolves terminal → `merchant_id`, `location_id`, `payment_terminal_id` |
| `batch_no` | `settlement_batches.batch_number` | also equals `order_payments.batch_number` stamped at capture |
| `batch_opened_at` / `batch_closed_at` | `settlement_batches.opened_at` / `closed_at` | |
| `purchase_amount` | `settlement_batches.gross_amount` | |
| `tip_amount` | `settlement_batches.tip_amount` | |
| `refund_amount` | `settlement_batches.refund_amount` | |
| `void_amount` (count from detail) | `settlement_batches.void_count` (context) | |
| `net_amount` (derived) | `settlement_batches.net_deposit` | gross + tip − refund |
| `trigger_source` + full payload | `settlement_batches.raw_response` (jsonb) | audit; auto-vs-manual flag |
| — | `settlement_batches.processor = 'valor'` | discriminator (added in the valor settlement migration) |

**`batch_detail` row → `order_payments`**

| Valor | Dexa `order_payments` | Notes |
|---|---|---|
| `batch_no` | `batch_number` | already stamped at capture — the primary match key |
| `approval_code` | `authorization_code` | |
| `rrn` | `rrn` | |
| `amount` / `tip_amount` | cross-check vs `amount` / `tip_amount` | discrepancy detection |
| `settled_at` | `settled_at` | set by the cascade trigger on batch close |
| `is_voided` / `is_reversed` | reconcile against `is_voided` / status | |

**Matching strategy for the (future) receiver.** Primary: link unsettled captured Valor payments by
`terminal_id = <terminal uuid>::text AND terminal_type='valor' AND batch_number = <batch_no> AND
is_settled = false`. Fallback (when a payment missed its `batch_number` at capture): the terminal's
unsettled captured payments with `captured_at` inside `[batch_opened_at, batch_closed_at]`. Then
cross-check the linked count/total against the summary — on mismatch, set the batch to **`needs_review`**
rather than a blanket settle (mirrors the invariants in `finalize_valor_settlement`).

---

## 6. HMAC-SHA256 verification reference

Valor signs each delivery:

```php
// Valor side
hash_hmac('sha256', json_encode($rawPayload) . $timestamp, $secret_key)
```

Headers on the request:

| Header | Value |
|---|---|
| `Valor-Signature` | HMAC-SHA256 hex digest |
| `Valor-Timestamp` | ISO-8601 UTC timestamp |

Receiver rules:

1. Read the **raw request body bytes** — do **not** re-serialize the parsed JSON. Valor hashes its own
   compact JSON, and re-encoding (esp. in Python) can change bytes and break the signature. Hashing the raw
   received body sidesteps this entirely.
2. Compute `HMAC_SHA256(rawBody + Valor-Timestamp, VALOR_WEBHOOK_SECRET)` and **constant-time compare** the
   hex against `Valor-Signature`.
3. Reject stale timestamps (a tolerance window) to block replays.
4. **Verify before parsing** — a forged/unsigned request must write nothing and return 4xx.

Model to copy when building the receiver: `supabase/functions/telnyx-webhook/index.ts` — it already does
verify-before-parse over the raw body with a timestamp tolerance, then calls a `SECURITY DEFINER` RPC via
the service-role client. (Telnyx uses Ed25519; swap the verify step for HMAC-SHA256 hex, keep the shape.)

---

## 7. Staging prerequisites & verification checklist

**Critical mapping note.** The webhook keys on **`epi_id`**, not the serial number. Serial
**NCC804380219** is only how the device is identified physically. The join anchor is
`payment_terminals.valor_epi`, which **must be populated** for that terminal on staging.

Confirm it (run against **staging** `dfwqakoyittmrwbqvxgw`, read-only):

```sql
select id, serial_number, valor_epi, valor_ip_address, merchant_id, location_id, is_active
from public.payment_terminals
where serial_number = 'NCC804380219';
```

- If `valor_epi` is **null**, the summary can't be mapped to a terminal — populate it with the device's EPI
  first. **Record the EPI value that corresponds to NCC804380219** here once known:
  `valor_epi = ____________`.

> **Staging state (checked 2026-08-04, project `dfwqakoyittmrwbqvxgw`):**
>
> | column | value |
> |---|---|
> | `id` | `22553a96-2e2a-4a8a-b2ea-8c56c33b92e1` |
> | `serial_number` | `NCC804380219` |
> | `valor_epi` | **`null` ← BLOCKER** |
> | `valor_ip_address` | `null` |
> | `valor_port` | `5000` |
> | `merchant_id` | `2add44cb-f498-4653-aca3-a8f0ca258e70` |
> | `location_id` | `8835e749-9bbf-4405-b4a4-7f28a56f990a` |
> | `is_active` | `true` |
>
> The terminal exists and is active, but **`valor_epi` is not set**, so the webhook could not be mapped to
> it yet. Before validating: obtain the device's EPI (Valor/ISV portal for this device, or the on-terminal
> settings) and set it — run against **staging**:
>
> ```sql
> update public.payment_terminals
> set valor_epi = '<EPI from Valor portal>'
> where id = '22553a96-2e2a-4a8a-b2ea-8c56c33b92e1';  -- serial NCC804380219
> ```
>
> (`valor_ip_address` is also null — needed for the POS→terminal transaction path, but **not** for the
> webhook mapping, which keys only on EPI.)

> **Live reconciliation snapshot (checked 2026-08-04, staging):** 5 captured Valor payments on this
> terminal, **all carrying a `batch_number`** (confirms the capture-time stamping in §5) — host batches
> `3`,`4`,`5`,`6`:
>
> | host `batch_number` | payments | settled | linked | Σ amount |
> |---|---|---|---|---|
> | 3 | 1 | yes | yes | 5.99 |
> | 4 | 1 | yes | yes | 30.49 |
> | 5 | 1 | yes | yes | 19.60 |
> | **6** | **2** | **no** | **no** | **179.92** |
>
> There are 3 `settlement_batches` rows (all `processor='valor'`, `status='settled'`, closed 2026-08-04,
> `failure_reason` hand-noted "Auto Batch @ 7PM"), created by the manual `prepare_valor_settlement` flow:
>
> - **The gap is live:** host batch **6** ($179.92) has **no settlement row** — its 2 payments are stranded
>   `is_settled=false`. This is exactly the auto-batch gap this doc addresses.
> - **The manual sweep mislabels host batches:** the row tagged `batch_number='4'` actually holds
>   `transaction_count=2, gross=$36.48` = batch 3 ($5.99) + batch 4 ($30.49), because
>   `prepare_valor_settlement` pins **by terminal + unsettled**, not by `batch_number`. Two of the three
>   rows have `batch_number=null`. A webhook receiver that keys by EPI and matches payments **by
>   `batch_number`** (§5) both closes batch 6 and avoids this merging — but requires `valor_epi` to be set.
> - Note the manual path works today **despite `valor_epi=null`** because it keys on the terminal UUID and
>   the EPI identity guard is skipped when the stored EPI is null; the **webhook path cannot** — `epi_id` is
>   its only join key.

**Validation steps:**

1. Complete §2 (enable webhooks, register URL, subscribe SUMMARY + DETAIL, enable HMAC, capture the secret).
2. Trigger a batch — either wait for the **7:00 PM auto-batch**, or run a **manual batch** on the device to
   test sooner.
3. Capture the delivered `batch_summary` (and `batch_detail`) JSON (e.g. from a temporary logging endpoint
   or the receiver's logs).
4. Confirm the payload's **`epi_id` matches** the stored `valor_epi` from the query above.
5. Confirm the payload's **`batch_no` matches** the `batch_number` on the captured Valor `order_payments`:

   ```sql
   select id, batch_number, is_settled, amount, tip_amount, captured_at
   from public.order_payments
   where terminal_id = '<terminal uuid>'::text
     and terminal_type = 'valor'
     and batch_number = '<batch_no from payload>';
   ```
6. Confirm `trigger_source` reads **"Auto Batch"** for the 7:00 PM run.

**Follow-up:**

- ~~Build the `valor-webhook` edge function + `record_valor_batch_webhook(p_payload jsonb)` RPC~~ **DONE.**
  Idempotent (unique `(payment_terminal_id, batch_number) WHERE origin='valor_webhook'`), self-auditing
  (service_role bypasses the settlement audit trigger, so the RPC logs its own row), dead-letters unknown
  EPIs to `webhook_dead_letter_queue (source='valor')`, and sets `settlement_batches.origin='valor_webhook'`.
  Count/amount mismatch → `needs_review` (mirrors `finalize_valor_settlement`).
- ~~Add `config.toml` entry (`verify_jwt = false`)~~ **DONE** (`[functions.valor-webhook]`). Still to do:
  set the `VALOR_WEBHOOK_SECRET` env var (from the Valor dashboard's auto-generated key) and deploy the fn.
- Promote to prod after staging validation.

### Known reconciliation gap — `funded_date`

`settlement_batches.funded_date` is populated by **no** settle path (POS, Valor webhook, or manual). Tsys
funding lands T+1/T+2, so to reconcile actual **deposits** (not just batch close) a funded-date/deposit-amount
source is still needed — an acquirer/Tsys funding feed, or an HQ backfill. The webhook records the batch
*close* (settlement_date, host `batch_number`, totals) which is what the portal's batch view shows; deposit
funding reconciliation is a separate follow-up. `settlement_batches.origin` now distinguishes an automatic
settle (`valor_webhook` / `pos_auto`) from a manual one for triage.

---

## References (code, read-only)

- `supabase/migrations/20260723170000_valor_settlement_rpcs.sql` — manual settle RPCs, settle invariants, `processor` discriminator
- `supabase/migrations/20260714130100_valor_terminal_columns.sql` — `valor_epi` and other `valor_*` columns
- `supabase/migrations/20260714130200_process_payment_v17_valor.sql` (lines 642-654) — `batch_number` stamped at capture
- `supabase/migrations/20260510195909_wave_f1_cascade_is_settled_on_batch_close.sql` — the cascade trigger
- `supabase/migrations/20260510210257_wave_h2_lazy_link_index_pin.sql` — lazy-link trigger (skips `valor`)
- `supabase/migrations/20260510201336_admin_batch_rpcs_use_batch_number.sql` — `get_admin_settlement_batches()` reconciliation join
- `app/manage/transactions/components/BatchReconciliationSection.tsx` — the dashboard surface
- `supabase/functions/telnyx-webhook/index.ts` — HMAC/verify-before-parse edge-function model
