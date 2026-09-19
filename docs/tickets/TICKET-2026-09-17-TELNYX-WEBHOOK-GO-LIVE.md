# Telnyx Webhook Go-Live And Message Ledger Completion

## Source Contract

- Notion title: `[Backend · Messaging] Telnyx webhook go-live — connect the built receiver, close the ledger gaps, confirm what we send`
- Notion page ID: `3de8280c-1b1d-81b3-8ced-fc8d9efe92a3`
- Notion URL: https://app.notion.com/p/3de8280c1b1d81b38cedfc8d9efe92a3?pvs=204
- Assignee: Ali Dika
- Status when fetched: Not started
- Discussions when fetched: none
- Fetch date: 2026-09-18

### Source rechecked for the Campaigns UI (2026-09-20)

- Re-fetched the complete ticket and requested all discussions, including resolved
  block discussions. No discussions were returned. Ticket status: In progress.
- Also fetched the original source ticket and its discussions:
  `Wire-Up & Hardening — Support Counter, Notification Bell, Customer Marketing (Telnyx Email + SMS)`.
- Original page ID: `3728280c-1b1d-8182-9a45-e9e9fd2b79e2`.
- Original URL: https://app.notion.com/p/3728280c1b1d81829a45e9e9fd2b79e2?pvs=204
- Original ticket status: Done; no discussions returned.
- The September ticket explicitly leaves the Message Log UI for a follow-up.
  The user requested that follow-up as a new **Campaigns** navigation entry.
- The June ticket describes Telnyx email, while current Website email sends use
  Resend. This UI follow-up does not change providers or implement email callbacks.

### Campaigns UI follow-up

- Route: `/dashboard/campaigns`, linked beside Customers in the desktop sidebar,
  mobile More menu, and global navigation search.
- Campaign history lists existing SMS/email campaigns and quick messages, with
  campaign text, submission status, recipient count, and search/pagination.
- SMS message log reads `message_log` directly and includes transactional sends,
  campaign sends, and inbound replies. Filter by status, direction, rolling time
  period, phone/text, or a selected campaign. Open a row for full body, timestamps,
  sender/recipient, error, cost, Telnyx ID, and messaging profile.
- Active lists refresh every 15 seconds, with manual refresh and explicit loading,
  error, and empty states. Missing cost is not displayed as zero. Cost has no
  currency symbol because the ledger does not retain a separate currency column.
- Reads resolve the merchant on the server, explicitly filter its ID, and use
  the caller's authenticated Supabase client so existing RLS remains in force.
  Raw webhook payloads are not sent to the browser. The new page is read-only;
  campaign creation and sends remain in the existing Customers flow.
- No migrations, Edge Functions, webhooks, cron jobs, or environment variables
  are added by this UI follow-up. Existing webhook deployment requirements below
  still apply for delivered/failed updates, inbound replies, and reported cost.
- Automated verification: 31 tests pass across `tests/campaigns-actions.test.ts`,
  `tests/telnyx-ledger-go-live.test.ts`, and
  `lib/messaging/__tests__/message-log.test.ts`. New page/actions and navigation
  search pass ESLint. Linting the shared dashboard layout reports its existing
  `react-hooks/set-state-in-effect` violation in `MerchantDashboardLayout`.
- The repository-wide TypeScript check reports existing errors in other areas
  (including shared layout submenu icon types); none reference the new
  `app/dashboard/campaigns` files or `tests/campaigns-actions.test.ts`.
- Browser verification used the actual page with fixture data in an isolated
  local preview: campaign-to-log navigation, pagination, status filtering,
  search, empty state, details, refresh, and failed-request retry all pass.
  Desktop/light and mobile/dark screenshots were inspected. The log and detail
  dialog have no axe WCAG A/AA violations in this preview. This does not verify
  authentication, live RLS, or provider callbacks against staging.
- Pending manual QA: sign in as a merchant, open both tabs, inspect send/reply
  records, filter and paginate, verify mobile/dark mode, and repeat under a
  second merchant. Live delivery, recording, and verifier sign-off remain pending.

## Website Scope

- Harden the existing `telnyx-webhook` receiver and dead-letter failures.
- Make webhook reconciliation safe for duplicate and out-of-order events.
- Require tenant attribution for outbound webhook events.
- Record every Website-owned SMS send path in `message_log`.
- Record storefront OTP sends with verification codes redacted from the ledger.
- Preserve actual sender number and messaging profile metadata.
- Remove the unused unauthenticated `telnyx-messaging` boilerplate function.
- Add focused migration, webhook, and sender-contract tests.

## Shared POS Contract

The Website repository stores shared Supabase functions used by the POS app.
After Website review, synchronize these changed files into `Dexa-POS` in a
separate POS pull request:

- `supabase/functions/_shared/telnyx.ts`
- `supabase/functions/notify-waitlist-guest/index.ts`
- `supabase/functions/notify-reservation-guest/index.ts`
- `supabase/functions/send-receipt/index.ts`

No POS repository files are changed by the Website branch.

## Website SMS Inventory

- Online order lifecycle and merchant test notifications.
- Dashboard waitlist and reservation notifications.
- Storefront reservation notifications.
- Dashboard and Edge Function receipt delivery.
- Invoice delivery.
- Marketing campaigns and one-off quick messages.
- Waitlist and reservation guest Edge Functions.
- Storefront phone-verification OTPs, with the code redacted in `message_log`.

Every listed path uses the same Telnyx sender contract and writes the provider
message ID, merchant, destination, sender number, and messaging profile to the
ledger when available.

## Migration

- `20260918120000_telnyx_message_ledger_go_live.sql`
- Adds an external event ID to the shared webhook DLQ and an idempotency index.
- Extends `log_outbound_message` with messaging-profile metadata.
- Makes `record_telnyx_message` monotonic under out-of-order callbacks.
- Uses `order_notifications.provider_id` as a legacy attribution fallback.
- Rejects unattributed outbound callbacks so the Edge Function captures them in
  the DLQ instead of creating tenantless merchant-invisible ledger rows.

Apply to staging first. Do not apply through an ad hoc SQL editor without
recording the migration in the normal chain.

### Deployment Record

- Applied to staging project `dfwqakoyittmrwbqvxgw` on 2026-09-18 with
  `supabase db push --linked`.
- Confirmed in the remote migration ledger as local/remote version
  `20260918120000`.
- Not applied to production.
- This database application did not deploy Edge Functions, configure secrets,
  or change Telnyx messaging-profile settings.

## Separate Deployment Requirements

- Set `TELNYX_PUBLIC_KEY` in staging and production.
- Set `TELNYX_WEBHOOK_URL` and `TELNYX_WEBHOOK_FAILOVER_URL` when staging and
  production cannot use separate messaging profiles.
- Deploy `telnyx-webhook` after the migration.
- Deploy `notify-waitlist-guest`, `notify-reservation-guest`, and `send-receipt`.
- Remove or disable the deployed `telnyx-messaging` function.
- Configure distinct staging and production Telnyx messaging-profile webhook
  URLs where possible.
- No source change or merge means any migration, function, secret, or Telnyx
  profile configuration has been deployed.

## Required Manual QA

- Staging send to real phone: `sent` to `delivered`, with cost/raw/profile/from.
- Reply: exactly one inbound row with customer and merchant attribution.
- STOP, blocked resend, and START consent flow.
- Order, waitlist, reservation, receipt, quick-message, campaign, invoice,
  storefront reservation, and redacted storefront OTP sends each create one
  correctly attributed row.
- Invalid number ends as failed on the same ledger attempt.
- Duplicate and out-of-order callbacks do not duplicate or regress the row.
- Forced RPC failure creates one Telnyx DLQ row.
- Forged and stale signatures are rejected without writes.
- Cross-merchant reads remain blocked.
- Repeat the send, reply, and STOP checks in production.
- Send the required recording to Abubeckr and obtain independent sign-off.
