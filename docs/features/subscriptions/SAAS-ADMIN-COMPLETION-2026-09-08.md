# SaaS Admin Completion

## Scope

This change completes the website/shared-database portion of the SaaS access, paid add-on authorization, and billing-restoration workflow. It intentionally leaves the product decision and current behavior for **Pay Outstanding Balance** unchanged.

## Implemented

- One authoritative database access decision combines merchant lifecycle status, merchant-tier billing, location-service billing, and grace state.
- `past_due` remains accessible during grace. Access is blocked when HQ or automation moves the applicable subscription to `suspended`.
- A suspended merchant-tier billing subscription disables stations and terminals for every merchant location.
- Merchant-tier billing status is authoritative and is synchronized to the legacy merchant plan summary used by existing screens/callers.
- A suspended location-service subscription disables only that location.
- Restoration only re-enables station and terminal records that are not still blocked by another suspended billing scope.
- Merchant users can request non-hardware paid add-ons per location after viewing quantity, recurring monthly price, and card surcharge.
- Add-on submission requires affirmative acceptance and stores non-deletable evidence: immutable merchant/location/service IDs and name snapshots, amount, cadence, user, email, timestamp, IP, browser/device user agent, terms text/version, and a unique authorization reference.
- HQ can view pending add-on requests, export authorization evidence as CSV, deny a request, or approve it.
- Approval performs the Valor-backed save-and-charge flow before marking the request approved. A failed payment leaves the prior configuration intact and the request pending.
- QR Table Ordering now uses the shared entitlement RPC instead of a duplicated website-only calculation.
- Successful billing recovery creates idempotent merchant/HQ in-app notifications and merchant/Support emails from direct charges, recurring Valor webhooks, and manual paid reconciliation.

## Migration

`supabase/migrations/20260908120000_saas_admin_access_entitlements_and_authorizations.sql`

- Adds `subscription_service_requests`, name snapshots, and immutable update/delete authorization guards.
- Adds the add-on request link to `app_notifications`.
- Adds `get_subscription_access_state(merchant_id, location_id)`.
- Preserves `get_merchant_subscription_status(merchant_id)` for current POS compatibility while adding the effective access result.
- Adds `get_subscription_entitlement(merchant_id, location_id, service_code)`.
- Replaces `apply_subscription_access_state(subscription_id)` with billing-scope-aware suspension/restoration behavior.
- Does not charge cards, generate invoices, rewrite historical invoices, or deploy itself.

Apply after `20260906120000_separate_subscription_billing_scopes.sql`. Regenerate `app/database.types.ts` only after the migration is deployed to the target Supabase environment.

## Edge Functions

Deploy after the migration:

- `billing-charge-subscription`
- `billing-mark-paid`
- `valor-webhook`

Required existing secrets/configuration:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `BILLING_NOTIFICATION_EMAILS`
- `SUPPORT_TICKET_NOTIFICATION_EMAILS`
- Existing Valor and internal billing secrets required by these functions

## Manual QA

1. Set a tier or location subscription to `past_due`; confirm POS/website access remains available and the UI shows the warning.
2. Suspend the merchant-tier subscription; confirm every merchant location's stations and terminals are disabled.
3. Restore the tier while one location subscription remains suspended; confirm only unblocked locations restore.
4. Suspend one location subscription; confirm other locations remain enabled.
5. As a merchant, open **Subscription & Billing > Add-ons**, select a location, request an add-on, and accept the recurring authorization.
6. Confirm HQ receives an in-app notification and sees the request in **Subscriptions > Location Add-ons**.
7. Export evidence and verify reference, amount, cadence, user, timestamp, IP, user agent, terms version, and accepted text.
8. Deny one request and confirm merchant in-app/email notification.
9. Approve one request with a valid location Valor card; confirm payment succeeds before the service becomes active.
10. Force a Valor decline; confirm the previous assignments remain active and the request remains pending.
11. Recover a failed subscription payment; confirm merchant/HQ in-app notifications and merchant plus `support@mtechdistributors.com` emails.
12. Verify QR access for direct assignment, qualifying tier, past-due grace, suspended tier, and suspended location.

## POS Follow-up

The website repository does not modify POS source. POS should adopt `get_subscription_access_state(merchant_id, location_id)` for location-aware access and `get_subscription_entitlement(merchant_id, location_id, service_code)` for paid module gates. The existing merchant-only `get_merchant_subscription_status` remains compatible and receives the effective access status.

## Staging Verification

Source code cannot prove that remote jobs, secrets, or functions are deployed. Before sign-off, verify:

- Both migrations are present in staging migration history in rollout order.
- The three Edge Functions above are deployed from this revision.
- `RESEND_API_KEY` and notification recipient settings are configured.
- The automatic invoice/charge/retry/grace/suspension cron jobs are enabled and have recent successful runs.
- `valor-webhook` has a valid secret, receives signed recurring events, and records successful processing.
- Valor sandbox card charge, decline, recovery, tier-wide suspension, location isolation, and restoration QA all pass.

Deployment audit on 2026-09-08:

- `20260906120000_separate_subscription_billing_scopes.sql` is applied on the linked environment.
- `20260908120000_saas_admin_access_entitlements_and_authorizations.sql` is applied on linked project `dfwqakoyittmrwbqvxgw`.
- `app/database.types.ts` was regenerated from the linked schema after the migration.
- `billing-charge-subscription`, `billing-mark-paid`, and `valor-webhook` are active, but the restoration changes in this branch are not deployed.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPPORT_TICKET_NOTIFICATION_EMAILS`, and `VALOR_WEBHOOK_SECRET` are present.
- `BILLING_NOTIFICATION_EMAILS` is not present. Support still receives restoration mail through `SUPPORT_TICKET_NOTIFICATION_EMAILS` and the mandatory `support@mtechdistributors.com` recipient.
- Migration history was reconciled from remote `20260903120000` to repository version `20260903121000` after confirming their SQL differs only by blank lines.
- Edge Function presence does not prove cron scheduling or recent successful execution; verify those records in Supabase before sign-off.
