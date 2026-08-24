# Merchant Subscription Requests and Read-Only Notifications

## Summary

Merchants can select a non-current subscription tier and submit it to DEXA
Billing for review. The request is a dedicated billing workflow record, not a
support ticket. HQ can approve and activate the requested tier or deny it with
an optional note. Both HQ and merchant users receive read-only in-app
notifications for the events relevant to them.

The merchant subscription page now follows the same scope boundaries as the
billing engine:

- the tier, primary payment profile, transactions, and invoices are
  merchant-wide;
- the primary payment profile is the earliest active primary profile used as
  the merchant-tier billing anchor;
- other location payment profiles remain visible as secondary context; and
- hardware inventory and hardware requests remain location-scoped.

Support tickets remain reserved for intentional support conversations.

## Billing Safety Addendum - 2026-08-24

The first three SaaS-billing hardening items are implemented in code:

1. All five service-role billing Edge Functions require either the Supabase
   service-role bearer token or the existing `x-internal-secret`.
2. Failed subscription charges create attempt-scoped merchant and HQ in-app
   notifications and email the merchant billing contact plus DEXA support.
   A delivery ledger prevents duplicate delivery for the same attempt.
3. Merchant plan requests require explicit recurring-charge authorization.
   The server snapshots the plan, price, terms version, user/email, IP address,
   user agent, acceptance time, and a unique authorization reference. Accepted
   evidence is immutable.

These items do not yet implement automatic grace-period suspension, a merchant
payment-method editor, or outstanding-balance collection.

## Implemented Flow

1. A merchant selects an available tier on `/dashboard/subscriptions`.
2. Submission creates one pending `subscription_plan_requests` row with a
   `SUB-xxxxx` request number.
3. HQ users with `system.billing.manage` receive a read-only notification that
   links to the merchant subscription workspace.
4. The merchant page displays the pending request after reload and blocks a
   second request until HQ decides the first one.
5. HQ sees the request, requested/current plans, price, and request date.
6. **Approve & activate** applies the requested plan through the existing
   subscription and invoice synchronization flow, marks the request approved,
   and notifies the merchant.
7. **Deny request** marks the request denied without changing billing and sends
   the merchant an optional decision note.
8. Direct HQ assignments without a merchant request remain supported and create
   a read-only merchant notification instead of a support ticket.
9. A merchant can submit a `DEV-xxxxx` hardware request for one location. HQ
   reviews each location request independently and the merchant receives the
   decision as a read-only notification.

## Scope and Security

- Merchant users can request but cannot activate their own plan.
- HQ approval and denial require `system.billing.manage`.
- Only service-role server actions write requests and notifications.
- Merchant reads are tenant-scoped with `user_belongs_to_merchant` and exclude
  DEXA admin identities.
- HQ reads require `system.billing.manage`.
- Notification read state is per Clerk user.
- Notification cache keys include Clerk user, active organization, and HQ versus
  merchant surface to prevent cross-context cache reuse.
- One pending request per merchant is enforced by a partial unique index.
- One pending hardware request per merchant/location pair is enforced by a
  separate partial unique index.
- Notification delivery failure does not roll back a successful billing change;
  the UI reports a warning instead.
- Plan approval stores the merchant-wide `merchant_plan_subscriptions.id` on
  the request. It never writes the location anchor `merchant_subscriptions.id`,
  preventing the first approval from failing its foreign-key update and
  requiring a second click.

## Database Migration

Migration:

`supabase/migrations/20260824120000_subscription_plan_requests_and_app_notifications.sql`

Creates:

- `subscription_plan_requests`
- `app_notifications`
- `app_notification_reads`
- `get_my_app_notifications(integer)`
- `get_my_unread_app_notification_count()`
- `mark_app_notification_read(uuid)`
- `mark_all_app_notifications_read()`
- RLS policies, grants, indexes, request-number sequence, and realtime
  publication for notification inserts

Hardware migration:

`supabase/migrations/20260824130000_subscription_hardware_requests.sql`

Creates `subscription_hardware_requests`, the `DEV-xxxxx` request-number
sequence, location-scoped uniqueness, RLS, grants, indexes, and the updated-at
trigger. Apply it after the notification migration.

Authorization and failed-payment delivery migration:

`supabase/migrations/20260824140000_subscription_authorizations_and_failure_notifications.sql`

Adds immutable plan-authorization evidence and the RLS-protected, idempotent
failed-payment delivery ledger. Apply it after both request migrations. It was
created but not executed during implementation.

The migration is present in code but was not executed during implementation.
Apply it to shared staging before deploying or testing the website code. Do not
deploy the website first because the subscription overview reads the new
request table.

After staging deployment, regenerate Supabase TypeScript types. The new table
access currently uses narrow `any` casts only because generated types cannot be
updated before the migration exists in the shared database.

## Files Changed

- `supabase/migrations/20260824120000_subscription_plan_requests_and_app_notifications.sql`
  - Adds the request lifecycle and read-only notification contract.
- `lib/notifications/app-notifications.ts`
  - Adds the server-only notification writer.
- `app/actions/read-only-notifications.ts`
  - Adds authenticated notification feed and read-state actions.
- `components/notifications/ReadOnlyNotificationBell.tsx`
  - Adds the realtime read-only notification bell and popover.
- `app/dashboard/layout.tsx`
  - Adds the merchant read-only notification bell beside support.
- `app/manage/layout.tsx`
  - Adds the HQ read-only notification bell beside support.
- `app/dashboard/actions/subscription-billing.ts`
  - Replaces automatic support-ticket creation with request creation, HQ
    notification, duplicate prevention, and pending-request reads.
- `components/billing/MerchantSubscriptionOverviewCard.tsx`
  - Shows persisted pending state, merchant-wide billing, the canonical billing
    anchor, secondary location payment methods, and a real location-scoped
    hardware request form.
- `app/manage/actions/subscription-billing.ts`
  - Adds pending-request loading, denial, approval finalization, merchant
    notification, and direct-assignment notification.
- `components/billing/HqSubscriptionsWorkspace.tsx`
  - Adds plan and hardware approval/denial controls.
- `supabase/migrations/20260824130000_subscription_hardware_requests.sql`
  - Adds the dedicated location-scoped hardware request lifecycle.
- `supabase/migrations/20260824140000_subscription_authorizations_and_failure_notifications.sql`
  - Adds immutable authorization evidence and the notification delivery ledger.
- `supabase/functions/_shared/internal-billing-auth.ts`
  - Centralizes service-role and internal-secret authorization.
- `supabase/functions/_shared/subscription-failure-notifications.ts`
  - Delivers idempotent merchant/HQ failed-payment notifications and emails.
- `supabase/functions/_shared/payment-emails.ts`
  - Adds the failed subscription payment email.
- `supabase/functions/billing-*/index.ts`
  - Protects all billing mutations; charge/failure handlers now notify.
- `tests/subscription-billing-safety.test.ts`
  - Covers billing authorization, consent evidence, and failure alerts.

## Environment

- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` enable optional emails.
- `SUPPORT_TICKET_NOTIFICATION_EMAILS` remains the configured DEXA recipient
  list for the request email fallback. Its name is legacy; request persistence
  and in-app delivery do not depend on email.
- No new environment variable is required for in-app notifications.
- `INTERNAL_NOTIFICATION_SECRET` authorizes scheduled billing calls that do not
  use the service-role bearer token.
- `BILLING_NOTIFICATION_EMAILS` optionally adds billing-specific recipients.
  `support@mtechdistributors.com` and `SUPPORT_TICKET_NOTIFICATION_EMAILS` are
  still included for failed-payment alerts.

## Verification Completed

- TypeScript syntax transpilation passed for all nine changed TypeScript/TSX
  files using installed TypeScript 6.0.3.
- `git diff --check` passed.
- Focused ESLint passed for the new actions, notification helper and bell,
  merchant subscription component, and manage layout.
- The wider changed-file lint reaches pre-existing React 19
  `react-hooks/set-state-in-effect` findings in `app/dashboard/layout.tsx` and
  `components/billing/HqSubscriptionsWorkspace.tsx`; none point to the new
  request or notification blocks.
- A scoped semantic TypeScript check reported zero diagnostics in the nine
  changed TypeScript/TSX files. The loaded project still contains 14 unrelated
  diagnostics outside this change set.
- `tests/subscription-plan-request-notifications.test.ts`: 6 tests passed. The
  contract tests cover request lifecycles, RLS/read-state primitives, exact
  request finalization, merchant-wide billing, location-scoped hardware, and
  the no-automatic-support-ticket boundary.
- `tests/subscription-billing-safety.test.ts`: 4 tests passed. The contract
  tests cover internal Edge Function authorization, required consent, immutable
  evidence, delivery idempotency, and merchant/HQ failed-payment alerts.
- Authenticated database/realtime/Resend QA remains pending.

## Manual QA

### 1. Migration preflight

1. Apply both migrations to shared staging in timestamp order before deploying
   the website branch.
2. Confirm the notification/request tables, hardware request table, and four
   notification RPCs exist.
3. Confirm RLS is enabled and forced on all three tables.
4. Regenerate Supabase TypeScript types after the migration is deployed.

### 2. Merchant request

1. Sign in as a merchant and open `/dashboard/subscriptions`.
2. Open **Plan & coverage** and select a non-current plan.
3. Choose **Review plan request**, then submit.
4. Confirm the success message contains a `SUB-xxxxx` number.
5. Reload the page.
6. Confirm the pending request banner remains visible and another request cannot
   be submitted.
7. Confirm no support ticket was created.

### 3. HQ notification and approval

1. Sign in as HQ with `system.billing.manage`.
2. Confirm the bell unread count increases and the request notification appears.
3. Open it and confirm it lands on the correct merchant workspace.
4. Confirm the pending card shows the request number, requested plan, current
   plan, price, and date.
5. Choose **Approve & activate**.
6. Confirm the tier and billing artifacts save, the request becomes `approved`,
   and no support ticket is created.
7. Return as the merchant and confirm the bell contains the approval update and
   links to `/dashboard/subscriptions`.

### 4. Denial

1. Submit another request from a merchant after the first request is complete.
2. Open it as HQ, enter an optional decision note, and choose **Deny request**.
3. Confirm the current subscription is unchanged and the request becomes
   `denied`.
4. Confirm the merchant receives a read-only denial notification containing the
   note and can submit a new request afterward.

### 5. Location and identity isolation

1. Repeat with two merchants.
2. Confirm each merchant sees only its own notifications and request.
3. Switch Clerk organizations in one browser session and confirm notifications
   refresh without showing the previous organization's cached rows.
4. Confirm an HQ user without `system.billing.manage` cannot read or decide
   billing requests.

### 6. Realtime and read state

1. Keep the merchant or HQ notification popover open in one session.
2. Trigger a relevant event from another session.
3. Confirm the unread count refreshes without a manual reload.
4. Mark one notification read, then mark all read.
5. Reload and confirm read state persists per user.

### 7. Email fallback

1. Confirm configured DEXA recipients receive the request email.
2. Confirm merchant billing email, or owner email fallback, receives approval
   and denial emails.
3. Verify in-app delivery still works when Resend is intentionally unavailable
   and that the successful billing/request action returns a warning.

### 8. Merchant-wide billing scope

1. Use a merchant with payment profiles and invoices at multiple locations.
2. Open `/dashboard/subscriptions` and confirm there is no page-level location
   selector.
3. Confirm **Plan & coverage** always shows the merchant billing anchor.
4. Open **Billing** and confirm totals/history include all merchant invoices,
   each invoice identifies its location, and secondary location payment methods
   are listed separately.
5. Open **Hardware** and confirm location selection remains available only for
   device inventory and requests.

### 9. Hardware request and decision

1. In **Hardware**, select Location A, request two devices, and add a note.
2. Confirm a `DEV-xxxxx` request appears as pending for Location A and an HQ
   notification is created.
3. Confirm the merchant may submit a separate request for Location B but cannot
   create a second pending request for Location A.
4. In HQ, approve Location A and deny Location B with decision notes.
5. Confirm each pending card disappears, no inventory row is created
   automatically, and the merchant receives both read-only decisions.

### 10. Merchant recurring-charge authorization

1. Select a non-current plan and open **Review plan request**.
2. Confirm **Submit request** is disabled until the recurring-charge checkbox
   is selected.
3. Select it, submit, and inspect the new `subscription_plan_requests` row.
4. Confirm the authorization reference, server price snapshot, terms version,
   user/email, acceptance timestamp, IP, and user agent are present.
5. In staging only, attempt to update an accepted authorization field and
   confirm the immutable-evidence trigger rejects it.

### 11. Failed-payment alerts

1. In staging, use a controlled declined NMI test credential or invoke the
   protected failure handler for a test invoice.
2. Confirm the invoice becomes `failed` and the subscription becomes
   `past_due`.
3. Confirm merchant and HQ notification bells receive the failure alert.
4. Confirm merchant billing and configured DEXA recipients receive email.
5. Confirm delivery rows are `sent`; repeating the same recorded attempt must
   not duplicate notifications, while a new attempt must create a new alert.

### 12. Internal billing authorization

1. Call each billing function without service-role authorization or
   `x-internal-secret`; expect HTTP 401.
2. Repeat with the service-role bearer token; expect normal function behavior.
3. Repeat a scheduled function with the matching internal secret; expect
   normal function behavior.

## Remaining Work

- Apply all three migrations to shared staging in timestamp order.
- Regenerate Supabase TypeScript types.
- Run authenticated staging QA, including realtime and tenant isolation.
- Verify Resend delivery logs.
- Record merchant request, HQ approval or denial, and merchant notification as
  the closure artifact.
