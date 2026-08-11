# Runbook — Payment Origin Whitelist Sync

## What this is

When a merchant's storefront (including the QR scan-to-order flow) is saved or enabled from HQ, the action `adminSaveOnlineOrderingSettings` / `adminToggleOnlineStore` writes the set of browser origins the storefront can be reached from into `location_payment_devices.whitelist_origins` and stamps `whitelist_synced_at`.

This is a **local mirror** of the allow-list that ops keeps in the NMI / Dejavoo merchant portal. The application does not call NMI's API. NMI Collect.js enforces its own per-merchant origin allow-list at tokenization time, so until an operator registers each origin in the NMI portal, the storefront will fail to tokenize cards from that origin even if the local DB column lists it.

## When to run this runbook

- A merchant goes live on a new `slug` (e.g. `tasty-burger.dexaposai.com`)
- A merchant adds or changes a `custom_domain`
- The storefront returns a Collect.js error like `Invalid origin` / `Tokenization failed` on launch
- Periodic audit: rows where `whitelist_synced_at IS NOT NULL` but the operator never confirmed registration in the NMI portal
- **Before any QR dine-in launch (QR-32).** The QR scan route `/s/{slug}/t/{token}` is path-based on the same storefront origin, so it inherits coverage automatically — but you still need to (a) confirm every active location's local mirror is current and (b) confirm those origins are registered in the NMI portal.

## Audit + backfill scripts (QR-32)

Two scripts wrap the same sync code path the HQ save/toggle action uses, so you don't need to click through HQ admin for each location. Both read the service-role key from `.env`.

```bash
# Read-only audit — prints every location whose computed origins are NOT
# fully present in `whitelist_origins`. Use this to know which origins
# still need to be registered in the NMI portal.
npx tsx scripts/audit-storefront-whitelist.ts
npx tsx scripts/audit-storefront-whitelist.ts --merchant <merchantId>
npx tsx scripts/audit-storefront-whitelist.ts --json

# Idempotent bulk sync — merges the computed origin set into every active
# online-ordering location's `whitelist_origins`. Safe to re-run.
npx tsx scripts/backfill-storefront-whitelist.ts --dry-run
npx tsx scripts/backfill-storefront-whitelist.ts
npx tsx scripts/backfill-storefront-whitelist.ts --merchant <merchantId>
```

The shared module is [`lib/payments/storefront-whitelist.ts`](../../../lib/payments/storefront-whitelist.ts) — `computeStorefrontOrigins`, `syncStorefrontWhitelistForLocation`, `bulkSyncStorefrontWhitelist`, `auditStorefrontWhitelist`. The HQ admin action imports from there too, so behaviour is guaranteed identical.

## Where the local list comes from

`computeStorefrontOrigins(slug, customDomain)` in [app/manage/actions/admin-merchant/online-ordering.ts](../../../app/manage/actions/admin-merchant/online-ordering.ts) builds the list from:

1. `https://{slug}.{NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN}` — defaults to `dexaposai.com`
2. `https://{custom_domain}` — when set on `online_store_config`
3. The origin of `NEXT_PUBLIC_APP_URL` — for the path-based `/sites/{slug}` access
4. Any comma-separated origins in `NMI_DEFAULT_ALLOWED_ORIGINS` — e.g. the Dejavoo payment widget origins

The new list is **merged** with whatever was already in `whitelist_origins` (never replaces). To remove a stale origin, do it manually in Supabase.

## How to mirror into the NMI portal

1. Find the location in HQ admin and hit the storefront save/toggle action (or run it programmatically). Capture the returned `whitelistOrigins` array.
2. Alternatively, query directly:
   ```sql
   SELECT lpd.whitelist_origins, lpd.whitelist_synced_at, osc.slug, osc.custom_domain
   FROM location_payment_devices lpd
   JOIN online_store_config osc ON osc.location_id = lpd.location_id
   WHERE lpd.location_id = $1
     AND lpd.use_for_online_ordering = true
     AND lpd.is_active = true;
   ```
3. Log in to the merchant's NMI gateway (via Dejavoo's CRM if onboarded that way, or directly on `secure.networkmerchants.com` for direct NMI merchants).
4. Open the **Security Keys** / **Tokenization Key** for this merchant.
5. Under the tokenization key's allowed-origins setting, paste each origin from the list. Save.
6. From the storefront, place a $0.01 test order — Collect.js must tokenize and `process-online-payment` must capture without origin errors.
7. Note in the merchant's ticket: which origins registered, in which portal, at what time.

## Skip reasons surfaced by the action

| `skipReason`                         | Meaning                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `no_active_online_ordering_device`   | No `location_payment_devices` row with `use_for_online_ordering=true, is_active=true`. NMI device must be created first. |
| `unchanged`                          | Computed origin set was already a subset of `whitelist_origins`. No write needed. |

## Future work

This runbook becomes obsolete the day we wire a real NMI tokenization-key origin API call into `syncStorefrontWhitelist`. Until then, the portal step is the gate.
