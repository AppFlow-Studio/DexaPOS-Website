# HQ Developer Ticket Creation + New-Ticket Email Notifications

## Purpose

Allow authorized DEXA HQ support administrators to create developer tickets
from the HQ Support Inbox while notifying the configured developer email list
whenever any support ticket is created.

The notification is source-independent. Tickets created by the POS, merchant
dashboard, HQ dashboard, or another future writer all pass through the same
`support_tickets` insert trigger.

## Implemented Scope

### HQ ticket creation

- Entry point: `/manage/support` -> **New Developer Ticket**
- Form route: `/manage/support/new`
- Required permission: `hq.support.manage`
- Inputs: category, priority, subject, and developer details
- Location: always the server-configured DEXA HQ location
- Metadata:
  - `source = hq_admin`
  - `audience = developers`
  - `hq_created = true`
- The first conversation message is stored with `sender_role = admin`.
- The dedicated `create_hq_support_ticket` RPC is executable only by
  `service_role`; browsers and POS clients cannot invoke it directly.
- HQ support routes and service-role support actions enforce
  `hq.support.view` for reads and `hq.support.manage` for writes.
- The HQ navigation item uses `hq.support.view` rather than the unrelated
  audit-log permission.
- `hq.platform_admin` receives both support permissions through an idempotent
  role-permission migration.

### New-ticket email notification

- An `AFTER INSERT` trigger on `public.support_tickets` calls the protected
  `/api/internal/support-ticket-created` endpoint through `pg_net`.
- The endpoint loads the ticket, merchant, and location from Supabase.
- Resend emails the configured recipients in one delivery.
- The email contains:
  - ticket number and subject
  - priority and category
  - merchant and location
  - submitter and source
  - description
  - direct HQ ticket link
- Delivery state is stored in
  `public.support_ticket_notification_deliveries`.
- A database-backed delivery claim prevents repeated or concurrent endpoint
  calls from emailing the same ticket twice.
- Failed deliveries and processing attempts older than five minutes can be
  retried.
- Missing configuration or Resend failure is recorded/logged but does not roll
  back the support ticket.

## Files

- `app/manage/support/page.tsx`
- `app/manage/support/layout.tsx`
- `app/manage/support/new/page.tsx`
- `app/manage/support/new/layout.tsx`
- `app/manage/actions/support.ts`
- `app/api/internal/support-ticket-created/route.ts`
- `lib/support/ticket-notifications.ts`
- `lib/messaging/resend.ts`
- `supabase/migrations/20260728120000_hq_support_ticket_creation_notifications.sql`
- `supabase/migrations/20260728123000_platform_admin_support_permissions.sql`

## Required Application Environment

Configure these values in the website deployment:

```env
DEXA_HQ_SUPPORT_LOCATION_ID=<uuid of the DEXA HQ location>
SUPPORT_TICKET_NOTIFICATION_EMAILS=alidexapos@gmail.com,alidika1000@gmail.com
INTERNAL_NOTIFICATION_SECRET=<strong random shared secret>
RESEND_API_KEY=<resend api key>
RESEND_FROM_EMAIL=<verified sender, for example support@dexapos.com>
NEXT_PUBLIC_APP_URL=https://<website-host>
```

`RESEND_FROM_EMAIL` must use a domain verified in Resend when emailing
recipients other than the Resend account's own test address.

## Required Supabase Setup

1. Apply:

```text
supabase/migrations/20260728120000_hq_support_ticket_creation_notifications.sql
supabase/migrations/20260728123000_platform_admin_support_permissions.sql
```

2. Store the endpoint URL in Supabase Vault:

```sql
select vault.create_secret(
  'https://<website-host>/api/internal/support-ticket-created',
  'support_ticket_notify_url'
);
```

3. If `internal_notification_secret` does not already exist, create it:

```sql
select vault.create_secret(
  '<same value as website INTERNAL_NOTIFICATION_SECRET>',
  'internal_notification_secret'
);
```

If a secret with either name already exists, use `vault.update_secret(...)`
instead of creating a duplicate. Never paste secret values into migrations.

## Manual QA

### HQ-created ticket

1. Sign into DEXA HQ as a user with `hq.support.manage`.
2. Open `/manage/support`.
3. Confirm **New Developer Ticket** is visible.
4. Create a ticket with a recognizable subject and priority.
5. Confirm the new detail page opens.
6. Confirm merchant/location resolve to DEXA HQ.
7. Confirm the first message is displayed as a DEXA/admin message.
8. Confirm the row contains:
   - `metadata.source = hq_admin`
   - `metadata.audience = developers`
   - `metadata.hq_created = true`
9. Sign in as `hq.platform_admin` and confirm Support is visible and the
   developer-ticket form is available.

### Merchant/POS ticket

1. Create a ticket from the merchant dashboard or POS.
2. Confirm it appears in `/manage/support`.
3. Confirm its original merchant and location remain unchanged.

### Email delivery

For both ticket sources:

1. Confirm one email reaches:
   - `alidexapos@gmail.com`
   - `alidika1000@gmail.com`
2. Confirm the email values and HQ link are correct.
3. Verify the delivery ledger:

```sql
select
  st.ticket_number,
  d.status,
  d.recipient_emails,
  d.resend_message_ids,
  d.attempt_count,
  d.last_error,
  d.sent_at
from public.support_ticket_notification_deliveries d
join public.support_tickets st on st.id = d.ticket_id
order by d.created_at desc
limit 20;
```

Expected: `status = 'sent'` and both test recipients are present.

### Duplicate-delivery protection

1. Re-send the internal notification request for the same ticket ID using the
   configured internal secret.
2. Confirm the response reports `already_sent` after a successful delivery.
3. Confirm the ledger still has one row and neither recipient receives a
   second email.

### Failure isolation

1. Temporarily use an invalid Resend key in a non-production environment.
2. Create a ticket.
3. Confirm the ticket still exists and opens normally.
4. Confirm the delivery ledger records `status = 'failed'` and `last_error`.

## Deployment Order

1. Deploy the website code and application environment variables.
2. Apply the migration in staging.
3. Create/update the two Vault secrets in staging.
4. Complete staging QA for HQ and merchant/POS ticket sources.
5. Repeat the migration and Vault configuration through the approved
   production deployment process.

## Status

Implementation is complete locally. Staging migration, environment
configuration, Resend delivery, and cross-source manual QA remain.
