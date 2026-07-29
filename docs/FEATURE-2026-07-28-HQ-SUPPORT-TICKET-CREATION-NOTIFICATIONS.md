# HQ Internal Developer Tickets + New-Ticket Email Notifications

## Purpose

Allow authorized DEXA HQ administrators to create internal developer tickets
without inventing a DEXA HQ merchant or location row. Merchant and POS support
tickets continue to use their real tenant ownership.

Every new support ticket still uses the same source-independent notification
trigger, whether it originates from POS, a merchant dashboard, or DEXA HQ.

## Data Model

`support_tickets.ticket_scope` defines ownership:

- `merchant`: requires `merchant_id`; `location_id` remains optional.
- `hq_internal`: requires `merchant_id`, `location_id`, and `carrier_id` to be
  null.

The append-only migration
`supabase/migrations/20260729120000_hq_internal_support_ticket_scope.sql`:

- adds and constrains `ticket_scope`;
- makes `merchant_id` nullable for platform-scoped records;
- converts earlier `metadata.hq_created = true` tickets to `hq_internal`;
- replaces location-dependent `create_hq_support_ticket` overloads with one
  location-free, service-role-only RPC;
- keeps merchant ticket RLS tenant-scoped and gives authenticated HQ users
  access to both scopes;
- prevents internal tickets from generating merchant unread state.

No fake DEXA HQ merchant, location, or carrier is required.

## Implemented Scope

### HQ ticket creation

- Entry point: `/manage/support` -> **New Developer Ticket**
- Form route: `/manage/support/new`
- Required permission: `hq.support.manage`
- Inputs: category, priority, subject, and developer details
- Optional initial attachments: up to 3 PNG, JPEG, WebP, or PDF files at
  5 MB each
- Scope: always `hq_internal`
- Tenant fields: `merchant_id = NULL`, `location_id = NULL`,
  `carrier_id = NULL`
- Metadata:
  - `source = hq_admin`
  - `audience = developers`
  - `hq_created = true`
  - `source_org_id = <active HQ Clerk organization>`
- The first conversation message is stored as an admin message and is already
  read for both HQ and the nonexistent merchant recipient.
- Initial attachments are linked to the first message transactionally.
- Creation is authorized by `assertHQPermission("hq.support.manage")`.
- The active Clerk HQ organization comes from
  `DEXA_POS_INTERNAL_TEAM_ID`, which is already used by HQ authentication.
- Audit logging is platform-scoped and does not inherit impersonation or
  location-cookie context.

### Inbox and detail behavior

- The support inbox can filter by **Merchant** or **HQ Internal**.
- HQ rows display **DEXA HQ Internal**, never **Unknown Merchant**.
- Internal detail pages use developer/reporting wording instead of merchant
  reply wording.
- Merchant links and location fields only render for merchant tickets.
- Existing merchant and POS ticket behavior remains unchanged.

### New-ticket email notification

- An `AFTER INSERT` trigger on `public.support_tickets` calls the protected
  `/api/internal/support-ticket-created` endpoint through `pg_net`.
- Resend emails the configured recipients in one delivery.
- Merchant ticket emails contain merchant and location context.
- HQ internal ticket emails contain `Scope: DEXA HQ Internal` and do not show
  fake merchant or location values.
- Delivery state is stored in
  `public.support_ticket_notification_deliveries`.
- A database-backed claim prevents duplicate or concurrent delivery.
- Notification configuration or delivery failure never rolls back the ticket.

## Files

- `app/manage/actions/support.ts`
- `app/manage/support/page.tsx`
- `app/manage/support/new/page.tsx`
- `app/manage/support/[ticketId]/page.tsx`
- `app/dashboard/actions/audit-logs.ts`
- `lib/support/ticket-notifications.ts`
- `types/support-ticket.ts`
- `app/database.types.ts`
- `supabase/migrations/20260728120000_hq_support_ticket_creation_notifications.sql`
- `supabase/migrations/20260728123000_platform_admin_support_permissions.sql`
- `supabase/migrations/20260728130000_hq_support_ticket_initial_attachments.sql`
- `supabase/migrations/20260729120000_hq_internal_support_ticket_scope.sql`

## Required Website Environment

Configure these in the website deployment environment:

```env
# Existing HQ Clerk organization used by admin authentication.
DEXA_POS_INTERNAL_TEAM_ID=<DEXA HQ Clerk organization ID>

# New-ticket recipients.
SUPPORT_TICKET_NOTIFICATION_EMAILS=alidexapos@gmail.com,alidika1000@gmail.com

# Shared with Supabase Vault internal_notification_secret.
INTERNAL_NOTIFICATION_SECRET=<strong random shared secret>

# Resend configuration used by the website notification endpoint.
RESEND_API_KEY=<Resend API key>
RESEND_FROM_EMAIL=<verified sender, for example support@dexapos.com>

# Used to build links in notification emails.
NEXT_PUBLIC_APP_URL=https://<website-host>
```

Remove `DEXA_HQ_SUPPORT_LOCATION_ID` if it was added previously. It is obsolete.

`RESEND_FROM_EMAIL` must use a domain verified in Resend when emailing
recipients other than the Resend account's own test address.

## Required Supabase Vault Secrets

Only these two values are required in Supabase Vault for this notification
flow:

1. `support_ticket_notify_url`
2. `internal_notification_secret`

Inspect names without exposing secret values:

```sql
select id, name, created_at, updated_at
from vault.secrets
where name in (
  'support_ticket_notify_url',
  'internal_notification_secret'
)
order by name;
```

Create missing values:

```sql
select vault.create_secret(
  'https://<website-host>/api/internal/support-ticket-created',
  'support_ticket_notify_url'
);

select vault.create_secret(
  '<same value as website INTERNAL_NOTIFICATION_SECRET>',
  'internal_notification_secret'
);
```

If a name already exists, update it instead of creating a duplicate:

```sql
select vault.update_secret(
  '<existing secret UUID>',
  '<new secret value>',
  '<secret name>'
);
```

Never paste real secret values into a migration or commit.

## Deployment

Apply these migrations in order if the earlier support feature has not yet
been deployed:

```text
20260728120000_hq_support_ticket_creation_notifications.sql
20260728123000_platform_admin_support_permissions.sql
20260728130000_hq_support_ticket_initial_attachments.sql
20260729120000_hq_internal_support_ticket_scope.sql
```

For an environment where the first three are already applied, apply only
`20260729120000_hq_internal_support_ticket_scope.sql`.

Use the approved staging SQL-editor and migration-repair process before
production. Do not run raw Markdown in the SQL editor.

## Manual QA

### HQ internal ticket

1. Sign into DEXA HQ with `hq.support.manage`.
2. Open `/manage/support` and create a developer ticket with an image.
3. Confirm the detail page opens and shows **DEXA HQ Internal**.
4. Confirm there is no merchant/location link or `Unknown Merchant` label.
5. Add a developer update and a private HQ note.
6. Assign, change priority, change category, and resolve the ticket.
7. Filter the inbox to **HQ Internal** and confirm the ticket appears.
8. Verify the database record:

```sql
select
  ticket_number,
  ticket_scope,
  merchant_id,
  location_id,
  carrier_id,
  metadata->>'source' as source,
  metadata->>'source_org_id' as source_org_id
from public.support_tickets
where ticket_number = '<created ticket number>';
```

Expected: `ticket_scope = 'hq_internal'`, all three tenant IDs are null, and
source metadata identifies the HQ flow.

### Merchant/POS regression

1. Create a support ticket from a merchant dashboard or POS.
2. Confirm it appears under the **Merchant** scope filter.
3. Confirm its merchant and location values remain unchanged.
4. Confirm a user from another merchant cannot read it.
5. Confirm a merchant user cannot read the HQ internal ticket.

### Email delivery

For one HQ internal ticket and one merchant ticket:

1. Confirm one email reaches each configured test recipient.
2. Confirm the HQ email says **DEXA HQ Internal** and has no fake tenant.
3. Confirm the merchant email includes the real merchant/location.
4. Confirm both links open the correct HQ detail route.
5. Verify delivery state:

```sql
select
  st.ticket_number,
  st.ticket_scope,
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

Expected: `status = 'sent'` and both recipients are present.

## Status

Website and migration implementation are complete locally. Remaining work is
staging migration application, website/Vault configuration, cross-scope RLS
QA, email delivery QA, and production promotion through the approved process.
