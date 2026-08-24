# Merchant Subscription Requests and Read-Only Notifications

## Summary

Merchants can select a non-current subscription tier and submit it to DEXA
Billing for review. The request is a dedicated billing workflow record, not a
support ticket. HQ can approve and activate the requested tier or deny it with
an optional note. Both HQ and merchant users receive read-only in-app
notifications for the events relevant to them.

Support tickets remain reserved for intentional support conversations.

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
- Notification delivery failure does not roll back a successful billing change;
  the UI reports a warning instead.

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
  - Shows persisted pending state and clarifies that no ticket is opened.
- `app/manage/actions/subscription-billing.ts`
  - Adds pending-request loading, denial, approval finalization, merchant
    notification, and direct-assignment notification.
- `components/billing/HqSubscriptionsWorkspace.tsx`
  - Adds the HQ approval and denial controls.

## Environment

- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` enable optional emails.
- `SUPPORT_TICKET_NOTIFICATION_EMAILS` remains the configured DEXA recipient
  list for the request email fallback. Its name is legacy; request persistence
  and in-app delivery do not depend on email.
- No new environment variable is required for in-app notifications.

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
- `tests/subscription-plan-request-notifications.test.ts`: 3 tests passed. The
  contract test covers the request lifecycle, RLS/read-state primitives, and
  the no-automatic-support-ticket boundary.
- Authenticated database/realtime/Resend QA remains pending.

## Manual QA

### 1. Migration preflight

1. Apply the migration to shared staging before deploying the website branch.
2. Confirm all three tables and four RPCs exist.
3. Confirm RLS is enabled and forced on all three tables.
4. Regenerate Supabase TypeScript types after the migration is deployed.

### 2. Merchant request

1. Sign in as a merchant and open `/dashboard/subscriptions`.
2. Open **Plan & locations** and select a non-current plan.
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

## Remaining Work

- Apply the migration to shared staging.
- Regenerate Supabase TypeScript types.
- Run authenticated staging QA, including realtime and tenant isolation.
- Verify Resend delivery logs.
- Record merchant request, HQ approval or denial, and merchant notification as
  the closure artifact.
