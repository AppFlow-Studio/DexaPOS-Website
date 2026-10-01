# Plan: settle Valor online-order payments from the batch webhook

**Status:** Migration written and unit-tested. **Not applied to any environment.**
**Date:** 2026-09-29
**Rollout:** Staging first, validate, then promote to prod.

## Problem

Valor online-order payments are captured but never marked settled. On prod, 0 of 5 captured
online payments have `is_settled = true`, so they never reconcile in Settlements or HQ Batch
Reconciliation.

## Cause

Verified on prod 2026-09-29:

1. `record_valor_batch_webhook` resolves the EPI only against `payment_terminals.valor_epi`.
   An online order has no terminal. Its EPI lives on `merchant_processor_accounts`
   (`purpose = 'online_order'`), so the event is dead-lettered as `unknown_epi`.
2. Online payment rows are written with `batch_number = NULL`, even though Valor's sale
   response carries `batch_no` in `processor_response`.

## Design

The terminal path is unchanged. When no terminal owns the EPI, the receiver delegates to a new
function, `record_valor_online_batch_webhook`.

| Concern | Terminal path (unchanged) | Online path (new) |
|---|---|---|
| EPI lookup | `payment_terminals.valor_epi` | Active `online_order` account with that EPI |
| Batch key | `payment_terminal_id` | Synthetic serial `VT-<epi>`, terminal NULL |
| Payment match | `terminal_id` + `batch_number` | Location + EPI + batch number, `terminal_id IS NULL` |
| Idempotency | `uq_valor_webhook_batch` | Existing `uq_settlement_batches_host_key` |

### Changes from the first draft

- **No schema change.** The draft added `settlement_batches.processor_account_id`. Using the EPI
  as a synthetic serial number puts these batches under the unique index that already exists,
  and gives the HQ and merchant views a readable label with no UI work.
- **No edge-function change.** The match reads `batch_number` or, when that is NULL,
  `processor_response->>'batch_no'`, and records the batch number while linking. So it works
  for payments already captured and needs no change to the checkout path.
- **No backfill.** Same reason.

### Rules

- Exactly one active online-order account must own the EPI. Zero is `unknown_epi`. More than
  one is `ambiguous_epi`. An account with no location is `account_without_location`. All three
  are dead-lettered.
- `order_payments.amount` is the full charge with tip included. Valor may report that as
  `purchase_amount` alone or split across `purchase_amount` and `tip_amount`, so the batch
  settles when the linked total matches either. Otherwise it is `needs_review`.
- A settled batch with the same Valor `batches_id` is a redelivery and changes nothing. The same
  batch number with a different `batches_id` means the host counter restarted, so a new batch
  is created at the next `batch_epoch`.
- Voided payments are excluded, the same as on the terminal path.

## Work items

- [x] Migration `20260930140000_valor_online_order_settlement.sql`
- [x] Rollback `rollback/20260930140000_valor_online_order_settlement_rollback.sql`
- [x] Confirmed the repo copy of `record_valor_batch_webhook` equals the function live on
      staging and prod (md5 `a7d95de8…`), apart from one comment block
- [x] Unit tests: `tests/valor-online-order-settlement-migration.test.ts`
- [x] Read-only dry run of the match against prod data (below)
- [ ] Apply to staging and record the ledger row
- [ ] Functional test on staging (below)
- [ ] Apply to prod
- [ ] Replay dead-lettered summaries on prod (below)

## Read-only dry run (2026-09-29)

The matching predicate was run as a `SELECT` with no writes.

| Env | EPI | Batch | Summary gross | Would link | Linked total | Outcome |
|---|---|---|---|---|---|---|
| Prod | `2501496676` | 4 | $17.35 | 1 | $17.35 | settled |
| Staging | `2412333540` | 728, 734, 750, 759 | n/a | 2 to 3 each | n/a | `ambiguous_epi` |

Staging cannot show the happy path with current fixtures. Uptown Branch and FiDi Appflow
Studio Cafe both point their online-order account at Valor's public demo EPI.

## Functional test on staging

Run inside one transaction that ends by raising, so nothing persists:

1. Deactivate FiDi Appflow's online-order account, leaving Uptown as the only owner of
   `2412333540`.
2. Call the function with a synthetic summary for batch `750`: `purchase_amount` `6790`.
   Expect `status: settled`, `linked_count: 3`, and the three payments `is_settled = true`.
3. Call it again with the same `batches_id`. Expect `idempotent_replay`.
4. Call it with `purchase_amount` `9999` for batch `734`. Expect `needs_review`.
5. Call it with an EPI no account owns. Expect `unknown_epi`.
6. Confirm a terminal-owned EPI still settles through the terminal path.

## Replay on prod after applying

Idempotent by construction. Replays each dead-lettered summary once:

```sql
select public.record_valor_batch_webhook(p.raw_payload)
from (
  select distinct on (e.epi_id, e.batch_no) e.raw_payload
  from public.valor_webhook_events e
  where e.outcome = 'dead_letter'
    and e.raw_payload->>'event' = 'batch_summary'
    and e.epi_id in (
      select valor_epi from public.merchant_processor_accounts
      where processor = 'valor' and purpose = 'online_order' and is_active
    )
  order by e.epi_id, e.batch_no, e.received_at desc
) p;
```

Prod batches 1 to 3 (three $0.01 test payments) have no stored summary, so they will stay
unsettled unless closed manually in HQ.

## Related, not in this plan

- Prod `valor-webhook` still stores full transaction payloads, including customer contact
  details, for events it ignores. The branch version logs only the event name. Promote it.
- The prod webhook receives events for about 100 EPIs that are not Dexa's. Ask Valor or Mtech to
  scope delivery to the DEXAPOS ISV.
