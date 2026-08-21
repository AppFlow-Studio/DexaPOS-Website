# Merchant Plan Selection, Requests, and Notifications

## Summary

Merchant subscription cards on `/dashboard/subscriptions` are now selectable. A
merchant can review a non-current tier and submit it to DEXA Billing without
activating the plan directly.

The request and approval flow reuses the existing support notification system:

1. A merchant request creates a merchant-scoped `billing` support ticket.
2. DEXA staff receive the existing support unread indicator and configured
   support-ticket email notification.
3. When HQ applies a tier, a public DEXA Billing reply is added to the matching
   request thread.
4. If HQ assigns a tier without a prior request, a merchant-visible billing
   support thread is created automatically.
5. The merchant receives the support unread indicator and an email is attempted
   using the primary billing email, falling back to the merchant owner email.

Plan changes remain protected by `system.billing.manage`; merchants can request
but cannot activate their own subscription.

## Scope

### Merchant dashboard

- All active merchant-tier plans are shown whether or not a plan is active.
- Plan cards are keyboard-accessible selectable buttons with selected and
  current-plan states.
- The current plan cannot be requested again.
- The confirmation dialog shows the requested plan and monthly price.
- Duplicate open requests for the same merchant and plan return the existing
  ticket instead of creating another ticket.

### HQ billing

- Saving a merchant tier still performs the existing subscription and invoice
  synchronization first.
- Notification failures do not roll back a successful billing update.
- Saving an unchanged plan and status does not send a duplicate merchant
  notification.
- HQ receives a warning toast when in-app or email notification delivery cannot
  be confirmed.
- A matching merchant request is resolved after the DEXA Billing response is
  added.

## Files Changed

- `app/dashboard/actions/subscription-billing.ts`
  - Adds `RequestMerchantTierPlan` with active-plan validation, duplicate request
    protection, and merchant-scoped billing ticket creation.
- `components/billing/MerchantSubscriptionOverviewCard.tsx`
  - Adds selectable plan cards, request review, submission state, and feedback.
- `app/manage/actions/subscription-billing.ts`
  - Adds merchant in-app and email notification after an HQ tier assignment.
- `components/billing/HqSubscriptionsWorkspace.tsx`
  - Surfaces non-fatal notification warnings after a successful plan save.

## Database and Environment

- No new migration is required.
- Uses existing `support_tickets`, `support_ticket_messages`,
  `create_support_ticket`, `add_ticket_message_with_attachments`, unread-count
  RPC, realtime publication, and support email pipeline.
- DEXA request emails require the existing support notification configuration.
- Merchant assignment emails require `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.

## Verification

- Targeted ESLint for the changed actions and merchant component: pass.
- Isolated TypeScript check reaches only existing failures in
  `app/dashboard/actions/audit-logs.ts` and `components/ui/chart.tsx`.
- Repository TypeScript check is also blocked by malformed generated
  `.next/dev/types/routes.d.ts`; no tracked config was changed.
- Manual end-to-end QA remains required because it depends on authenticated
  merchant/HQ sessions, shared Supabase data, realtime, and Resend.

## Manual QA

### Merchant request

1. Sign in as a merchant and open `/dashboard/subscriptions`.
2. Open **Plan & locations**.
3. Confirm every active plan card is selectable on desktop, tablet, and phone.
4. Confirm the current plan is marked **Current** and cannot be submitted.
5. Select a different plan and choose **Review plan request**.
6. Confirm the dialog shows the requested plan and price.
7. Submit and record the returned `DEXA-xxxxx` ticket number.
8. Submit the same plan again before HQ responds.
9. Confirm the existing request number is returned and no duplicate ticket is
   created.

### DEXA notification

1. Sign in as HQ and confirm the support unread count increments.
2. Open `/manage/support` and find the new **Billing & Account** request.
3. Confirm the current plan, requested plan, price, and location count are in the
   ticket.
4. Confirm configured DEXA notification recipients receive the ticket-created
   email.

### Approval and merchant notification

1. Open `/manage/subscriptions/<merchant-id>` as a user with
   `system.billing.manage`.
2. Select the requested tier and save it.
3. Confirm the tier and billing artifacts save successfully.
4. Confirm the request ticket receives a public **DEXA Billing** reply and is
   resolved.
5. Return to the merchant account and confirm the support unread count
   increments.
6. Open the support ticket and confirm the applied plan/status message is
   visible.
7. Confirm the primary billing email, or owner email fallback, receives the
   subscription-updated email.
8. Repeat with a merchant that did not submit a request; confirm a new resolved,
   merchant-visible billing thread is created.

## Remaining Work

- Run the complete manual QA above on QA/staging.
- Verify Resend delivery logs and support notification delivery records.
- Attach a short recording covering merchant request, HQ assignment, and the
  merchant unread/update result before closing the ticket.
