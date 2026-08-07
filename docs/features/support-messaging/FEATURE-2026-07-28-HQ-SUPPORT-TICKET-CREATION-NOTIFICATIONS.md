# DEXA HQ Developer Tickets + Ticket/Thread Email Notifications

## Purpose

Allow authorized DEXA HQ administrators to create internal developer tickets
without inventing a DEXA HQ merchant or location row. Merchant and POS support
tickets continue to use their real tenant ownership.

Every new support ticket and every later reply/private note uses the same
source-independent notification endpoint, whether it originates from POS, a
merchant dashboard, or DEXA HQ.

## Data Model

`support_tickets.ticket_scope` defines ownership:

- `merchant`: requires `merchant_id`; `location_id` remains optional.
- `hq_internal`: requires `merchant_id`, `location_id`, and `carrier_id` to be
  null.

`hq_internal` remains the stable database value. The HQ interface presents it
as **Developer** or **DEXA HQ** because these tickets are already visible only
inside the HQ support workspace.

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

`support_tickets.assigned_to_emails` stores zero or more developer email
assignees for HQ-created tickets. It is separate from the legacy
`assigned_to` Clerk-user field, so multi-assignment does not break existing
single-owner filters or foreign keys.

## Implemented Scope

### HQ ticket creation

- Entry point: `/manage/support` -> **New Developer Ticket**
- Form route: `/manage/support/new`
- Required permission: `hq.support.manage`
- Inputs: category, priority, optional developer assignees, subject, and
  developer details
- The assignee dropdown is sourced only from
  `SUPPORT_TICKET_NOTIFICATION_EMAILS`, supports repeated selection, and
  displays removable selected-email badges.
- The server rejects any selected email that is not currently configured in
  `SUPPORT_TICKET_NOTIFICATION_EMAILS`.
- Assignment is optional and does not narrow notifications: every configured
  recipient still receives new-ticket, reply, and private-note emails.
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

- The support inbox can filter by **Merchant** or **Developer Tickets**.
- HQ rows display **DEXA HQ**, never **Unknown Merchant**.
- Inbox assignment state checks both legacy `assigned_to` and developer
  `assigned_to_emails`, so an email-assigned ticket is not shown as unassigned.
- Internal detail pages use developer/reporting wording instead of merchant
  reply wording.
- Merchant links and location fields only render for merchant tickets.
- Existing merchant and POS ticket behavior remains unchanged.

### Ticket and thread email notifications

- An `AFTER INSERT` trigger on `public.support_tickets` calls the protected
  `/api/internal/support-ticket-created` endpoint through `pg_net`.
- An `AFTER INSERT` trigger on `public.support_ticket_messages` calls the same
  endpoint for every later reply and private note.
- The initial description message created with a ticket is excluded from the
  message trigger, so creating a ticket sends one email rather than two.
- Resend emails the configured recipients in one delivery.
- Merchant ticket emails contain merchant and location context.
- HQ developer-ticket emails contain `Scope: DEXA HQ Developer Ticket` and do not show
  fake merchant or location values.
- New-ticket delivery state is stored in
  `public.support_ticket_notification_deliveries`; reply/note delivery state is
  stored in `public.support_ticket_message_notification_deliveries`.
- Database-backed claims prevent duplicate or concurrent delivery per ticket
  and per message.
- Notification configuration or delivery failure never rolls back the ticket.
- Reply emails identify the sender and distinguish a public thread reply from
  a private HQ note.
- Creation emails show the selected developer assignees or **Unassigned**.

## Files

- `app/manage/actions/support.ts`
- `app/manage/support/page.tsx`
- `app/manage/support/new/page.tsx`
- `app/manage/support/[ticketId]/page.tsx`
- `app/dashboard/actions/audit-logs.ts`
- `lib/support/ticket-notifications.ts`
- `lib/support/assignees.ts`
- `components/support/AssigneeEmailMultiSelect.tsx`
- `types/support-ticket.ts`
- `app/database.types.ts`
- `supabase/migrations/20260728120000_hq_support_ticket_creation_notifications.sql`
- `supabase/migrations/20260728123000_platform_admin_support_permissions.sql`
- `supabase/migrations/20260728130000_hq_support_ticket_initial_attachments.sql`
- `supabase/migrations/20260729120000_hq_internal_support_ticket_scope.sql`
- `supabase/migrations/20260729130000_support_ticket_thread_notifications.sql`
- `supabase/migrations/20260729140000_hq_support_ticket_email_assignees.sql`
- `supabase/migrations/20260806160000_support_ticket_email_assignment_consistency.sql`

## Required Website Environment

Configure these in the website deployment environment:

```env
# Existing HQ Clerk organization used by admin authentication.
DEXA_POS_INTERNAL_TEAM_ID=<DEXA HQ Clerk organization ID>

# New-ticket and thread-update recipients.
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

### Local testing limitation

A hosted Supabase database cannot call
`http://localhost:3000/api/internal/support-ticket-created`. Automatic trigger
delivery must be tested against a deployed staging URL in
`support_ticket_notify_url`. A direct local endpoint call can validate Resend,
but it does not validate the database trigger or `pg_net` path.

## Deployment

Apply these migrations in order if the earlier support feature has not yet
been deployed:

```text
20260728120000_hq_support_ticket_creation_notifications.sql
20260728123000_platform_admin_support_permissions.sql
20260728130000_hq_support_ticket_initial_attachments.sql
20260729120000_hq_internal_support_ticket_scope.sql
20260729130000_support_ticket_thread_notifications.sql
20260729140000_hq_support_ticket_email_assignees.sql
```

For an environment where the first three are already applied, apply only
the unapplied `20260729120000_hq_internal_support_ticket_scope.sql` and
subsequent support migrations in timestamp order.

Use the approved staging SQL-editor and migration-repair process before
production. Do not run raw Markdown in the SQL editor.

## Manual QA

### HQ internal ticket

1. Sign into DEXA HQ with `hq.support.manage`.
2. Open `/manage/support` and create a developer ticket with an image.
3. Open the assignee dropdown and select two configured developer emails.
4. Reopen the dropdown between selections and confirm earlier selections stay
   checked; remove and re-add one selected badge.
5. Confirm the detail page opens, shows **DEXA HQ**, and lists both
   selected developer assignees.
6. Confirm there is no merchant/location link or `Unknown Merchant` label.
7. Add a developer update and a private HQ note.
8. Change priority, change category, and resolve the ticket.
9. Filter the inbox to **Developer Tickets** and confirm the ticket appears.
10. Verify the database record:

```sql
select
  ticket_number,
  ticket_scope,
  merchant_id,
  location_id,
  carrier_id,
  assigned_to_emails,
  metadata->>'source' as source,
  metadata->>'source_org_id' as source_org_id
from public.support_tickets
where ticket_number = '<created ticket number>';
```

Expected: `ticket_scope = 'hq_internal'`, all three tenant IDs are null, and
source metadata identifies the HQ flow. `assigned_to_emails` contains the two
selected addresses.

### Merchant/POS regression

1. Create a support ticket from a merchant dashboard or POS.
2. Confirm it appears under the **Merchant** scope filter.
3. Confirm its merchant and location values remain unchanged.
4. Confirm a user from another merchant cannot read it.
5. Confirm a merchant user cannot read the HQ internal ticket.

### Email delivery

For one HQ internal ticket and one merchant ticket:

1. Confirm one email reaches each configured test recipient.
2. Confirm the HQ email says **DEXA HQ Developer Ticket** and has no fake tenant.
3. Confirm the merchant email includes the real merchant/location.
4. Confirm both links open the correct HQ detail route.
5. Add a public reply to each ticket and confirm one new-reply email per
   recipient.
6. Add a private note to the HQ ticket and confirm one private-note email per
   recipient.
7. Confirm the initial description did not generate a second reply email.
8. Verify new-ticket delivery state:

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

Website-created HQ and merchant tickets also request the same idempotent
endpoint directly after creation. This provides an immediate fallback for a
missing or delayed `pg_net` request. The database trigger remains in place for
POS and direct-database ticket creation. If the website cannot confirm the
request, it preserves the ticket and shows a notification warning.

9. Verify reply/private-note delivery state:

```sql
select
  st.ticket_number,
  stm.sender_name,
  stm.sender_role,
  stm.is_internal,
  d.status,
  d.recipient_emails,
  d.resend_message_ids,
  d.attempt_count,
  d.last_error,
  d.sent_at
from public.support_ticket_message_notification_deliveries d
join public.support_ticket_messages stm on stm.id = d.message_id
join public.support_tickets st on st.id = d.ticket_id
order by d.created_at desc
limit 30;
```

Expected: one `sent` row for every reply/private note and no delivery row for
the ticket's initial description message.

## Status

Website and migration implementation are complete locally for ticket creation,
reply, and private-note notifications. Remaining work is staging migration
application, website/Vault configuration, cross-scope RLS QA, email delivery
QA, and production promotion through the approved process.
