# Telnyx Webhook Go-Live And Message Ledger Completion

## Source Contract

**Current continuation status (2026-09-20): local fixes prepared, not deployed.**
See the continuation audit below for fresh staging evidence, the additional
unapplied migration, the reconciled POS receipt contract, and approval gates.

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
- Campaign history and Customer messages use URL-backed navigation links
  (`?view=campaigns` and `?view=messages`) that support reload and browser history.
  Both text and email campaigns open a details dialog; text campaigns also link
  to their individual customer messages.
- Customer messages reads `message_log` and includes transactional sends,
  campaign sends, and inbound replies. Filter by status, direction, rolling time
  period, phone/text, or a selected campaign. Details show a readable purpose
  (such as Reservation confirmation), customer phone, date, message preview,
  delivery explanation, and an actionable failure description.
- Public links have short labels. Local/private links are replaced in the preview
  with an explanation that customers cannot open them. Stored message bodies and
  sending behavior are unchanged; future messages with localhost links still
  require the public website URL to be configured separately.
- Active lists refresh every 15 seconds, with manual refresh and explicit loading,
  error, and empty states. Provider IDs, messaging profiles, raw webhook payloads,
  and cost are not fetched for this merchant-facing page.
- Message errors use the same readable descriptions in the desktop table, mobile
  cards, and details dialog. Translates provider codes, legacy HTTP/JSON responses,
  and known plain-text failures; unknown errors show a neutral support message.
  Raw errors remain stored for diagnostics and are never echoed in these views.
- Reads resolve the merchant on the server and explicitly filter its ID.
  Message reads use the caller's authenticated Supabase client and existing RLS.
  Campaign reads first verify `is_merchant_admin` with the caller's JWT, then use
  the existing server-only service client with the resolved merchant filter.
  This avoids the legacy campaign policy's `auth.uid()` UUID comparison with
  Clerk text IDs. Denied or failed permission checks prevent privileged reads.
  Membership/active HQ impersonation is also checked during context resolution.
  The new page is read-only;
  campaign creation and sends remain in the existing Customers flow.
- No migrations, Edge Functions, webhooks, cron jobs, or environment variables
  are added by this UI follow-up. Existing webhook deployment requirements below
  still apply for delivered/failed updates, inbound replies, and reported cost.
- Automated verification: 31 tests pass across `tests/campaigns-actions.test.ts`,
  `tests/telnyx-ledger-go-live.test.ts`, and
  `lib/messaging/__tests__/message-log.test.ts`. New page/actions and navigation
  search pass ESLint. Linting the shared dashboard layout reports its existing
  `react-hooks/set-state-in-effect` violation in `MerchantDashboardLayout`.
- Merchant-usability follow-up: 75 tests pass across the expanded
  `tests/campaigns-actions.test.ts`, `lib/messaging/__tests__/message-error.test.ts`,
  and `lib/messaging/__tests__/message-presentation.test.ts`. These cover denied
  campaign access, merchant filtering, error translation, truthful delivery
  labels, readable purposes, and public/local link previews. Changed Campaigns
  files, presentation helper/tests, and action tests pass ESLint.
- The repository-wide TypeScript check reports existing errors in other areas
  (including shared layout submenu icon types); none reference the new
  `app/dashboard/campaigns` files or `tests/campaigns-actions.test.ts`.
- Browser verification used the actual page with fixture data in an isolated
  local preview: campaign-to-log navigation, pagination, status filtering,
  search, empty state, details, refresh, and failed-request retry all pass.
  Desktop/light and mobile/dark screenshots were inspected. The log and detail
  dialog have no axe WCAG A/AA violations in this preview. This does not verify
  authentication, live RLS, or provider callbacks against staging.
- Follow-up browser checks pass for desktop clicks/mobile taps between views,
  direct view URLs, reload/back navigation, SMS and email campaign dialogs,
  campaign filtering, and readable reservation details without technical fields.
  Inspected desktop/light and mobile/dark screenshots; the desktop details
  dialog passes axe WCAG A/AA checks. This preview uses fixture data and mocked
  Next navigation; authenticated Next.js navigation still needs merchant QA.
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

## Continuation audit — 2026-09-20

### Source and boundaries

- Searched Notion and re-fetched the complete source page
  `3de8280c-1b1d-81b3-8ced-fc8d9efe92a3`, including the implementation toggle.
  Title: `[Backend · Messaging] Telnyx webhook go-live — connect the built receiver,
  close the ledger gaps, confirm what we send`.
  URL: https://app.notion.com/p/3de8280c1b1d81b38cedfc8d9efe92a3.
  Status remains In progress. Requested all block/resolved discussions; none
  returned. Suggested-edit discovery was reported as not enabled.
- Website PR https://github.com/AppFlow-Studio/DexaPOS-Website/pull/324 is open,
  head `a3e7db36e10422de306d1bae3bf37785ac8a1f2e` when read.
- POS PR https://github.com/AppFlow-Studio/Dexa-POS/pull/206 is open,
  head `ef103afa613958778415f26c8de6cec30014d6c8`. The local POS checkout matches
  that commit and was inspected read-only.
- Preserved the user's sole initial uncommitted change in
  `app/dashboard/campaigns/page.tsx`: date formatting omits seconds.
- No POS edits, shared-database migration application, deployment, secret change,
  commit, push, merge, Notion update, or reviewer message was performed.
- Rechecked the current [Telnyx Messaging webhook guide](https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks):
  Ed25519 covers `timestamp|raw body`, replay tolerance is five minutes, and the
  documented delivery policy allows up to three attempts per URL with failover.
  The receiver must not depend on those limited retries as its recovery mechanism.

### Fresh staging evidence (not a completed send test)

Read-only database/API audit: `node scripts/telnyx-staging-audit.mjs`.
Rejection probes: add `--probe-rejections`. The script refuses a database URL
other than staging `dfwqakoyittmrwbqvxgw`; it never sends an SMS or signed event.
Saved read-only operator queries: `docs/tickets/TELNYX-GO-LIVE-VERIFICATION.sql`.
Run statements separately after the new migration is approved/applied.

At 2026-09-20 12:58 UTC:

| Check | Observed result |
| --- | --- |
| SMS ledger | 44 rows; latest `34ba6332-543a-4950-9b0f-fb0cc782f8b5`, September 2 15:25:39 UTC, still `sent` |
| Delivered / inbound / webhook-touched SMS | 0 / 0 / 0 |
| Complete raw/cost/from/profile metadata | 0 rows |
| Unattributed outbound rows | 0, before any new end-to-end test |
| Sent online-order SMS | 47; all 47 provider IDs absent from the SMS ledger |
| Deployed Telnyx secret names | Only `TELNYX_API_KEY` and `TELNYX_FROM_NUMBER`; `TELNYX_PUBLIC_KEY`, profile ID, and per-message webhook URL secrets absent |
| Sender lookup in Telnyx | HTTP 200; configured number exists and has a messaging profile |
| That profile's primary URL | Does **not** equal the staging receiver URL; failover is configured. Environment ownership of the current URL is not established |
| Invalid-signature requests | Missing, forged, and stale+forged all returned HTTP 401; total ledger count stayed 84 before/after |

The CLI's existing login provided management read access even though no
`SUPABASE_ACCESS_TOKEN` was in the local environment. Secret listing was metadata
only; no credential values were retrieved or changed. Telnyx profile settings
were read with GET requests only. Local `.env` configuration does not establish
deployed Website environment configuration.

Downloaded deployed sources to a temporary review folder, never over the worktree:

| Staging function | Version / state | Source finding |
| --- | --- | --- |
| `telnyx-webhook` | 153 / ACTIVE, `verify_jwt=false` | Old receiver: direct RPC and 500; no new dead-letter handling |
| `telnyx-messaging` | 39 / ACTIVE, `verify_jwt=false` | Confirmed `Hello ${name}!` boilerplate; removed from repository but **still deployed** |
| `notify-waitlist-guest` | 46 / ACTIVE, `verify_jwt=false` | Deployed source has no outbound ledger call |
| `notify-reservation-guest` | 15 / ACTIVE, `verify_jwt=false` | Deployed source has no outbound ledger call |
| `send-receipt` | 18 / ACTIVE, `verify_jwt=false` | Website receipt source; no outbound ledger call or POS confirmation option |

Because the public key is absent, a 401 here does not prove genuine callbacks
can be accepted, nor does the stale+forged probe independently prove the deployed
timestamp check. Valid signed stale/future requests are tested locally. Repeat
staging signature tests after installing the correct key. No fresh real-phone
send, reply, STOP/START, or automatic delivery transition was performed.

### Confirmed gaps fixed in local code

| Gap | Implementation |
| --- | --- |
| Cross-merchant inbound lookup and STOP/START | New migration below resolves a unique prior outbound conversation by receiving number, full normalized customer number, and profile when supplied. Multiple merchants or no mapping raises an error for webhook DLQ capture. Customer lookup and consent changes are scoped to the resolved merchant. Duplicate customer records do not select an arbitrary customer ID |
| Old/duplicate consent callbacks | `customers.sms_consent_event_at` prevents an older STOP from overwriting a newer START; duplicate message IDs remain one ledger row |
| Quick-message tenant/customer authorization | `lib/messaging/marketing-access.ts` resolves the authenticated/impersonated merchant and checks the caller's `is_merchant_admin` permission before constructing a service client. `app/dashboard/actions/marketing.ts` scopes the customer to that merchant and requires the destination to match the saved customer contact. Missing permission/customer/consent fails closed |
| Premature delivered history | Quick messages and campaigns record `sent` on provider acceptance. `record_marketing_result` preserves terminal state if acceptance arrives after the delivery callback. Quick-message recipient history is created before sending. Campaign delivery loops are awaited rather than detached |
| Accepted send followed by ledger failure | Node and Edge senders share `supabase/functions/_shared/message-ledger.ts`. Failure captures exact ledger arguments and the provider ID in `webhook_dead_letter_queue`, source `telnyx_outbound`. No provider retry occurs. A service-only repair RPC replays the database write and marks recovery resolved atomically |
| Callback-before-recipient race | A later send-time ledger write rolls up the already-finalized status after attaching the recipient ID. Callback rollup errors are no longer swallowed |
| Out-of-order callbacks | Finalized status/raw are protected from older finalization and subsequent `message.sent` events |
| Lost provider reference on ancillary failure | Order and Edge guest senders attempt durable ledger/recovery capture before ancillary notification-history updates. Test-order notifications also log immediate provider failures. Quick-message responses retain the provider ID and return a tracking warning without inviting resend |
| OTP disclosure through callbacks | The receiver verifies original bytes, then redacts verification codes before RPC or DLQ storage. SQL also redacts callback body/raw defensively. The send-time OTP path already supplies a redacted body |
| POS/Website receipt divergence | Shared Edge function now accepts `confirmation`, uses the preserved POS embedded renderer, and retains Website send-token links; details below |

If both the ledger and recovery table writes fail, the helper emits only merchant
ID, provider ID, recovery status, and error code. This is observable but **not a
guarantee of durable recovery during a total database outage**. Support must use
the provider reference to reconstruct the missing ledger entry; never resend
the SMS to repair history. Unexpected process termination between provider
acceptance and persistence remains a distributed-system limitation. Large
campaign execution still needs runtime/batch-size QA; no durable send worker is
introduced by this change.

### New migration — approval required before application

`supabase/migrations/20260920130000_telnyx_tenant_consent_and_ledger_recovery.sql`

- Adds nullable `customers.sms_consent_event_at`; no existing customer consent is
  rewritten or backfilled.
- Adds `telnyx_phone_key(text)`, retaining country codes rather than last-ten-digit
  matching, with the same local ten-digit US expansion used by the senders.
- Replaces `record_telnyx_message` with tenant-scoped attribution/consent and
  callback redaction. Unmapped/ambiguous inbound events fail into the existing
  webhook DLQ without changing customer consent. A shared number serving the
  same customer across merchants therefore requires operational resolution or
  distinct receiving numbers/profiles; it cannot be inferred safely.
- Replaces `log_outbound_message` to validate customer/campaign/recipient tenant
  linkage, prohibit provider-ID reassignment, and reconcile late linkage.
- Replaces `record_marketing_result` to keep acceptance distinct from delivery;
  restricts its execution to service_role (Website callers use the service client).
- Adds service-role-only `repair_telnyx_outbound_ledger(uuid)`. Existing callback
  and send-time ledger RPCs also remain service-role-only.
- Does not rewrite the already-applied
  `20260918120000_telnyx_message_ledger_go_live.sql`. Both files must remain in
  the migration chain. No new migration was applied in this continuation.
- Rollout after approval: original migration first wherever absent, this new
  migration next, then Website/server and reconciled Edge code. Stage first;
  production only after staging evidence, review, and separate approval.

### Shared Edge bundle and POS reconciliation

There is one deployed function of each name per Supabase project. Website owns
this reconciled deployment candidate. POS #206 must not deploy its divergent
copy independently. Sync/review these files together in an approved POS follow-up:

- `supabase/functions/_shared/telnyx.ts` (same send contract; current copies differ
  in formatting and POS's Deno declaration).
- `supabase/functions/_shared/message-ledger.ts` (new recovery helper).
- `supabase/functions/_shared/pos-receipt-template.ts` (preserved embedded POS
  renderer from POS head `ef103afa`; ordinary receipts retain itemized text and
  HTML, kiosk confirmations omit prices/card details).
- `supabase/functions/notify-waitlist-guest/index.ts`.
- `supabase/functions/notify-reservation-guest/index.ts`.
- `supabase/functions/send-receipt/index.ts`.

The Edge receipt path accepts POS `confirmation: true` and supports the existing
`RECEIPT_BASE_URL/{receipt_token}` fallback. When Website `APP_URL` and send tokens
are available, it uses the two-token hosted link instead. Ordinary POS receipts
keep their embedded detail; Website email includes the hosted CTA. Website's
separate server-action renderer remains unchanged. Kiosk/receipt visual QA is
still required. The receipt function's existing caller-authentication contract
(decoded JWT subject with service-role order lookup) was not redesigned here;
review it before exposing any new public/kiosk calling mode.

No new cron or automatic repair worker is installed. Deploy the four named
functions (`telnyx-webhook` plus the three senders) with their shared imports;
configure `TELNYX_PUBLIC_KEY`, sender credentials, and the approved environment's
profile/per-message primary and failover URLs separately. `APP_URL` and optional
`RECEIPT_BASE_URL` must target the intended receipt host. Remove/disable staging
`telnyx-messaging` only after explicit approval.

### Website sender audit

All active Telnyx calls under `app`, `lib`, and `supabase/functions` were traced.
These are source-level checks, **not** fresh staging evidence:

| Path | Exact source | Ledger attribution |
| --- | --- | --- |
| Online-order lifecycle + test notifications | `lib/messaging/order-notifications.ts` | Resolved order/store merchant, customer when present, same provider ID in ledger and `order_notifications` |
| Quick messages and campaigns | `app/dashboard/actions/marketing.ts` | Authorized merchant, tenant customer, campaign and recipient IDs |
| Dashboard waitlist | `app/actions/notifications/waitlist.ts` | Waitlist merchant and guest phone |
| Dashboard reservation confirmed/cancelled | `app/actions/notifications/reservation.ts` | Reservation merchant and guest phone |
| Storefront reservation lifecycle | `lib/site-builder/reservations/notify.ts` | Reservation merchant and guest phone |
| Dashboard receipt | `app/actions/orders/send-receipt.ts` | Order merchant/customer |
| Invoice | `lib/messaging/invoice-send-core.ts` | Invoice merchant/customer |
| Storefront OTP | `app/sites/auth-actions.ts` | Resolved active-store merchant; redacted body |
| Edge waitlist/reservation | `supabase/functions/notify-waitlist-guest/index.ts`, `supabase/functions/notify-reservation-guest/index.ts` | RLS-resolved entry merchant; normalized phone |
| Edge receipt | `supabase/functions/send-receipt/index.ts` | Order merchant/customer; reconciled POS renderer |

### Automated verification

- 140 tests passed across 11 focused files: existing Campaigns action/error/
  presentation suites and `lib/messaging/__tests__/message-log.test.ts`, plus
  `tests/telnyx-ledger-go-live.test.ts`, `tests/telnyx-tenant-ledger.test.ts`,
  `tests/telnyx-quick-message.test.ts`, `tests/telnyx-ledger-recovery.test.ts`,
  `tests/telnyx-webhook-handler.test.ts`, `tests/telnyx-pos-receipt.test.ts`, and
  `tests/marketing-access.test.ts`.
- SQL tests execute the real ledger/RLS definitions and migration RPCs in
  isolated PGlite/Postgres, including two merchants, ambiguous conversations,
  consent ordering, invalid-number failure, repair idempotency, callback/linkage
  races, role restrictions, and OTP redaction. The RLS test uses simulated roles;
  it does not substitute for two real staging Clerk JWTs.
- Webhook tests execute the actual handler with generated Ed25519 keys and
  mocked database transport, including correctly signed stale/future/tampered
  bodies, forced RPC failure, duplicate DLQ capture, and OTP redaction.
- Focused ESLint passed for changed action/UI, helpers, Edge files, audit script,
  and new tests. Deno check passed for all four changed Edge entrypoints.
- Repository-wide `tsc --noEmit --incremental false` still fails, including
  existing project errors and Node's inability to resolve Deno imports.
  No diagnostics in the changed Node action/UI/helpers or regression tests.
  Deno entrypoints were checked separately with Deno. `git diff --check` passed.
- Added PGlite as a development test dependency, locked to 0.5.8.

### Acceptance criteria: evidence versus remaining work

| Ticket criterion | Current evidence | Next action |
| --- | --- | --- |
| Fresh sent → delivered with cost/raw/profile/from | **Pending**; zero such staging rows | Approve migration/configuration/deployment, select consenting test phone, then send from staging UI |
| Reply → exactly one attributed inbound row | Local SQL test passes; **staging pending** | Reply from that phone; inspect merchant/customer and duplicate count |
| STOP → blocked resend → START restores consent | Local tenant/ordering and action tests pass; **staging pending** | Perform real replies and attempt a fresh quick message while opted out |
| Online-order provider-ID match | Source wired; 47 historical gaps remain | Place staging order and compare fresh IDs; do not resend old messages to repair history |
| Each sender produces one attributed row | Source inventory and helper checks; **staging pending** | Exercise every row in the sender audit, including invoice and OTP |
| Zero unattributed outbound after full run | Baseline 0 only | Repeat count after the fresh complete QA run |
| Forged/missing/stale rejection without writes | Deployed probes 401, count 84 unchanged; key absent | Repeat after key configured; verify genuine callback accepted and independently test stale signing |
| Duplicate event idempotency | Local SQL/handler tests pass | Redeliver an actual staging event through Telnyx; compare same provider/event IDs |
| Forced RPC failure → one Telnyx DLQ row | Local handler test passes | Controlled staging failure with approval; restore immediately; prove one source=`telnyx` item |
| Invalid number → failed on same attempt | Local SQL/action tests pass | Use approved invalid test destination; retain provider code/reference |
| Second merchant JWT cannot read first ledger | Local RLS test passes | Repeat with two real staging merchant sessions/JWTs |
| Production connected; first three repeated | **Not attempted** | Only after staging passes and separate production approval |
| Messaging stub removed/locked | Source absent; **deployed ACTIVE v39** | Approve removal or disabling; verify inventory afterward |
| Required recording reviewed by Abubeckr | **Pending** | Record send → delivered row → reply → STOP → blocked resend → forged rejection, then send for Abubeckr review |
| Independent reviewer sign-off before Done | **Pending** | Reviewer other than implementer reviews code and evidence; keep ticket In progress |

### Approval package and next user action

1. Review local changes and approve applying only
   `20260920130000_telnyx_tenant_consent_and_ledger_recovery.sql` to staging through
   the migration chain (the original migration is already recorded there).
2. Supply/authorize secure configuration of the Telnyx public key and staging
   profile routing. Confirm whether the existing profile is production/shared
   before changing it; do not redirect production callbacks to staging.
3. Approve the reconciled Website deployment bundle and staging stub removal.
   Approve a separate POS synchronization before allowing POS #206 to deploy.
4. Identify the staging merchant, a consenting test customer/phone, and a second
   merchant session. No destination is assumed from historical customer data.
5. Run the acceptance matrix, attach the recording and review evidence; then
   request separate production rollout approval. Neither PR nor ticket is Done.

For an approved ledger recovery, inspect the `telnyx_outbound` DLQ item, then
invoke `repair_telnyx_outbound_ledger(p_dlq_id)` with service credentials. It
replays only `log_outbound_message`; a repeated invocation on a resolved item
does nothing. Review `telnyx` inbound ambiguity items separately after establishing
tenant routing; do not change customer consent by guessing a tenant. No repair
was run against staging or production in this continuation.
