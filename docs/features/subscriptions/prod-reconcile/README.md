# Production migration reconciliation — Valor recurring billing

**These `.sql` files are NOT repo migrations.** They live outside `supabase/migrations/`
on purpose so the Supabase CLI never auto-applies them. They are a **one-time,
out-of-band, PROD-only** set to close the migration-slot divergence that blocks
`20260906120000_separate_subscription_billing_scopes.sql` on production
(`hifouuofcaytijrkbvcy`).

## Why this exists

`20260906120000` requires the Valor lifecycle columns on `merchant_subscriptions`
(`processor_subscription_id`, `processor_subscription_status`, `processor_next_payment_at`).
On prod those columns do not exist, because the version slots the repo uses for the
two **billing** migrations are occupied by **reservation** migrations:

| Version slot | Repo content | Prod actually ran |
| --- | --- | --- |
| `20260830120000` | `subscription_billing_grace_and_retry_foundation` | `create_public_reservation_approval_mode` |
| `20260830130000` | `valor_saas_billing_lifecycle` (adds `processor_*`) | `expire_stale_reservation_requests` |

Because those version numbers are already recorded in prod's
`supabase_migrations.schema_migrations`, `supabase db push` **silently skips** the two
billing migrations, then fails on `20260906120000` with
`ERROR: column ms.processor_subscription_id does not exist (42703)`.

Prod's latest applied version is `20260904120000`, so the two billing migrations are
re-numbered **above** that (into free `20260905*` slots) to avoid the collision. They
are byte-for-byte copies of the repo migrations — only the version prefix changed.

## What to run, in this exact order

1. `20260905120000_subscription_billing_grace_and_retry_foundation.sql` (copy of repo `20260830120000`)
2. `20260905130000_valor_saas_billing_lifecycle.sql` (copy of repo `20260830130000`)
3. `supabase/migrations/20260906120000_separate_subscription_billing_scopes.sql` (already in the repo; its slot is free on prod — keep the number)

All three are transactional and idempotent-friendly (`add column if not exists`,
`drop constraint if exists` → `add constraint`, `create ... if not exists`), so a
partial state won't be left behind if one aborts.

## Procedure

1. **Clone first.** Restore a prod snapshot to an isolated project and run all three
   there. Confirm the columns/table appear and step 3 completes (its preflight should
   pass cleanly — prod has no `processor_subscription_id` data, so there are no external
   schedules to reconcile).
2. **Prod window.** Pause billing writers/workers + coordinate webhook delivery. Then,
   for each file in order:
   ```bash
   psql "$PROD_POOLER_URL" -v ON_ERROR_STOP=1 -f 20260905120000_subscription_billing_grace_and_retry_foundation.sql
   psql "$PROD_POOLER_URL" -v ON_ERROR_STOP=1 -f 20260905130000_valor_saas_billing_lifecycle.sql
   psql "$PROD_POOLER_URL" -v ON_ERROR_STOP=1 -f ../../../../supabase/migrations/20260906120000_separate_subscription_billing_scopes.sql
   ```
3. **Record the versions** so future `db push` stays consistent:
   ```sql
   insert into supabase_migrations.schema_migrations (version, name)
   values
     ('20260905120000','subscription_billing_grace_and_retry_foundation'),
     ('20260905130000','valor_saas_billing_lifecycle'),
     ('20260906120000','separate_subscription_billing_scopes')
   on conflict (version) do nothing;
   ```
   (Match the exact `schema_migrations` column shape prod uses — some projects also
   store a `statements` array.)

## Do NOT

- **Do not `supabase db push` to prod** to fix this — it skips the two billing versions
  (their slots are already recorded) and re-fails on `20260906120000`.
- **Do not clear/blank the processor fields** or otherwise bypass the `20260906120000`
  preflight. On a healthy prod there simply is no processor data yet, so the preflight
  passes once the columns exist.
- **Do not restore the old unique-location schema** after replacement rows exist.

## Aftermath — permanent, expected divergence

Prod will carry the billing content under `20260905120000` / `20260905130000` while the
repo carries it under `20260830120000` / `20260830130000`. That version-number
divergence is intentional and permanent; the repo's `20260830*` billing versions will
forever read as "already applied" on prod. Document it; do not try to "re-apply" them.
