# Supabase preview bootstrap repairs (2026-09-20)

PR #315 exposed failures in historical migrations when Supabase replayed the
website migration chain into a fresh preview database. These repairs are not
new migrations and must not be manually applied to staging or production.
The source files are already recorded as applied on existing databases.

## DejaVoo batch-number shim deadline

The May 10 sentinel in
`supabase/migrations/20260510210307_wave_h3_dejavoo_batch_number_shim_sentinel.sql`
had a removal deadline of 2026-08-10. Fresh previews created after that date
abort because `order_payments.dejavoo_batch_number` is still present. The
deadline is deferred to 2026-12-31, not removed.

Dropping the column now would break active code. The September 15
`process_payment_v17` migration still writes it; the August reconciliation
index and settlement RPCs still read it; website payment and batch views
still query it; and generated database types still expose it. A fresh preview
must retain the column to match the current application contract.

Before the new deadline, payment and settlement owners must migrate reads
and writes to `batch_number`, verify historical DejaVoo records remain
searchable, remove the dependent index and RPC references, regenerate types,
then drop the shim with an ordered migration. The sentinel should remain a
tripwire until that work is complete. This deferral is not permission to drop
the column on a live database as part of PR #315.
