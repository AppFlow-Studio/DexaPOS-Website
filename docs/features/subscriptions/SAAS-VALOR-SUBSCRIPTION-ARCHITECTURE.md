# SaaS and Valor Subscription Summary

Last reviewed: 2026-09-06. Scope separation requires the migration and Edge
Function deployment described in [the rollout guide](./BILLING-SCOPE-SEPARATION-QA.md).

## Core Model

Dexa has two subscription scopes:

1. **Merchant tier:** one plan for the entire merchant organization.
2. **Location subscription:** extra services and device charges for one location.

```text
Merchant
|
+-- One merchant-wide tier
|   +-- Stored in merchant_plan_subscriptions
|   +-- Own invoice and Valor schedule, paid by the merchant card
|
+-- Location A add-ons
|   +-- Services, devices, and station quantities, paid by Location A's card
|
+-- Location B add-ons
    +-- Independent subscription, invoices, and Location B's card
```

The tier is not duplicated for every location. The billing anchor only supplies
the `location_id` required by the current invoice structure.

Legacy combined subscriptions are archived without deleting their invoices or
service history. Replacement tier/location records start without a card and
cannot bill until HQ completes **Migrated billing: setup required**, then explicitly
activates them through **Save & Charge**. Preparation alone never charges.

## Main Records

| Record | Scope | Purpose |
| --- | --- | --- |
| `merchant_plan_subscriptions` | Merchant | Current merchant-wide tier and status. |
| `merchant_subscriptions` | Merchant tier or location | Separate rows identified by `metadata.billing_scope`. The first location can back a tier row AND have its own add-on row. |
| `merchant_subscription_services` | Location | Enabled add-ons and quantities for that location. |
| `device_billing_service_mappings` | Global | Maps a device category, such as KDS, to a billable service. |
| `merchant_billing_profiles` | Merchant or location | Stores Valor vault payment-profile references. |
| `subscription_invoices` | Billing stream | Stores the invoiced amount, line items, and payment status. |

## Merchant Tier Flow

The merchant views and requests a tier at `/dashboard/subscriptions`. HQ manages
it at `/manage/subscriptions/[merchantId]`.

1. The merchant selects a tier and accepts the recurring-charge terms.
2. HQ receives a notification and approves or denies the request.
3. Approval updates the merchant-wide tier.
4. Dexa uses the merchant-wide primary Valor card, or the first-created location's card if no merchant-wide card exists.
5. Dexa uses a dedicated merchant-tier billing row, separate from location add-ons.
6. Dexa creates the invoice and activates or updates the Valor schedule.
7. The tier remains active only if Valor approves the payment operation.
8. The merchant receives the approval or denial notification.

If Valor rejects the charge, Dexa restores the previous tier instead of granting
unpaid access.

### Billing anchor

The billing anchor is a technical requirement, not a location-specific tier.

- A merchant-global payment profile uses the first-created location as its invoice
  anchor.
- Without a merchant-wide card, only the earliest-created location's primary card is eligible. Dexa does not pick an arbitrary location with a card.
- Changing the dashboard location must not change the merchant's tier.
- The tier row contains only the tier charge. Even the anchor location's add-ons
  have their own row, invoice, and Valor schedule.
- Location subscriptions cannot fall back to the merchant card or another location's card.

## Location Add-ons

Each location can have its own services, device quantities, station count,
invoices, and subscription status.

Examples include:

- KDS devices.
- POS tablets.
- Software or support services.
- Stations above the plan's included quantity.

HQ configures these from the location section of
`/manage/subscriptions/[merchantId]`.

1. Select the location.
2. Save a primary Valor card for that location, then enable services and set quantities.
3. Review the calculated recurring total.
4. Select `Create & Charge` or `Save & Charge`.
5. Valor must approve the operation before the new configuration becomes active.

Changing Location A must not affect Location B.
Replacing the merchant card updates the tier only. Replacing a location card
updates that location's subscription and the tier only if the tier was already
using that location's card.

## What Mapping Means

There are three different mappings:

### Tier assignment

Maps the merchant to one merchant-wide tier.

### Location service assignment

Maps a billable service and quantity to one location subscription. This is how
location-specific add-ons are charged.

### Device billing mapping

Maps a device category to a billable service code. Deployed inventory can then
update the matching service quantity for its location.

The device mapping does not charge a merchant by itself. The device must be
fulfilled and deployed so the location quantity can be synchronized.

There is not yet one complete tier-to-feature entitlement map shared by the
website and POS. Billing a tier does not automatically prove every related
module is enforced across both applications.

## Pricing

The recurring amount is calculated from:

```text
plan or tier base price
+ additional stations
+ enabled location services and device quantities
+ one applicable card surcharge
= invoice total
```

The tier invoice includes only the tier price and its applicable surcharge.
Location invoices include only that location's service plan, devices, add-ons,
and applicable surcharge. Each stream has its own Valor schedule.

Invoice line items preserve the amount charged for that billing period even if
catalog prices change later.

## Valor Billing

New subscription cards use Valor Passage.js and Valor Vault. Dexa stores Valor
customer and payment-profile references, not the raw card number or CVV.

For a new subscription:

1. Dexa validates the invoice, billing profile, and Valor subscription account.
2. Dexa creates a Valor recurring schedule and requests the first charge.
3. Success marks the invoice paid and the subscription active.
4. Failure marks the invoice failed and the subscription `past_due`.

For future months, Valor runs the recurring schedule. Dexa receives the result
through its webhook and updates invoices, notifications, grace state, suspension,
and restoration.

Dexa does not retry invoices that already belong to a native Valor schedule. This
prevents Valor and Dexa from charging the same invoice twice.

## Merchant Billing Exemption

HQ can mark an internal, demo, partner, or complimentary merchant as billing
exempt from `/manage/subscriptions/[merchantId]`. A reason is mandatory and an
expiration is optional.

- The exemption covers the merchant tier and every location subscription.
- Plans, add-ons, and quantities must still be assigned normally. The flag does
  not grant features.
- No card, invoice, charge, retry, failed-payment escalation, or overdue
  suspension is created while the exemption is active.
- Existing valid billing-profile links are preserved for later use; a new
  complimentary subscription may be created without a card.
- Billing periods are advanced without accumulating charges that become due
  after the exemption ends.
- Existing invoices remain visible for audit history but cannot be charged.
- Canceled subscriptions and a manually suspended merchant remain blocked.
- Active Valor recurring schedules must be paused before HQ can enable the flag.
- Enabling/disabling the exemption is written to the billing audit log with the
  actor, reason, timestamp, and optional expiration.

After the exemption expires or HQ disables it, normal billing resumes on the
next billing cycle. A card must exist before creating or reactivating paid
subscriptions.

### Exemption rollout

1. Apply `20260908130000_merchant_billing_exemption.sql` after
   `20260908120000_saas_admin_access_entitlements_and_authorizations.sql`.
2. Deploy `billing-charge-subscription`, `billing-generate-monthly-invoices`,
   `billing-handle-failure`, `billing-suspend-overdue`, and `valor-webhook`.
3. Regenerate `app/database.types.ts` from the deployed Supabase schema and
   confirm it matches the checked-in contract.
4. Run the billing exemption QA below before enabling it for a real merchant.

The migration and Edge Function source being merged does not mean either one is
deployed. Existing Valor schedules must be reachable when HQ first enables an
exemption because the website pauses each schedule before saving the flag.

## Additional Station Conflict

The current merchant tier cards are:

| Internal code | Display name | Price |
| --- | --- | --- |
| `basic` | Quick-Service (First Station) | $59.99 |
| `multi_location` | Fine Dining (First Station) | $99.99 |
| `franchise` | Additional Station | $49.99 |

The third card reuses the legacy `franchise` merchant-tier record. However,
additional stations are also calculated inside each location subscription using
station count and per-extra-station pricing.

This creates two competing meanings for **Additional Station**:

1. A merchant-wide tier card.
2. A per-location station overage.

This needs a business-model decision. The recommended model is to keep the
merchant tier merchant-wide and charge additional stations through the relevant
location subscription. Until that decision is implemented, these two charges
must not be treated as the same thing.

## Quick QA

### Merchant tier

- Request a tier as the merchant.
- Verify HQ receives the request notification.
- Approve it and verify Valor success is required.
- Verify the tier is the same when changing locations.
- Verify the merchant receives the decision notification.
- Force a Valor failure and verify the previous tier remains active.

### Location add-ons

- Add a service to Location A and charge it.
- Verify the service and invoice appear only for Location A.
- Change a per-unit quantity and verify the total.
- Deploy a mapped KDS or POS device and verify its location quantity updates.
- Force a charge failure and verify the new configuration is not activated.

### Recurring payment

- Verify initial activation creates only one Valor schedule.
- Verify an update changes the existing schedule instead of duplicating it.
- Verify a failed payment becomes `past_due`.
- Verify successful recovery restores the invoice and subscription state.

### Billing exemption

- Enable the exemption with a reason and no card, then assign a tier and a
  location add-on; verify both activate without an invoice or charge.
- Verify an unassigned add-on remains unavailable.
- Verify Location A assignments do not appear at Location B.
- Verify existing invoices can be viewed/downloaded but not charged.
- Cancel a subscription and manually suspend the merchant; verify both still
  block access.
- Set an expiration, pass it, and verify normal card/payment enforcement resumes.

## Main Code Areas

- `app/manage/actions/subscription-billing.ts`
- `app/dashboard/actions/subscription-billing.ts`
- `app/manage/subscriptions/[merchantId]/page.tsx`
- `app/dashboard/subscriptions/page.tsx`
- `supabase/functions/billing-charge-subscription/index.ts`
- `supabase/functions/billing-generate-monthly-invoices/index.ts`
- `supabase/functions/billing-handle-failure/index.ts`
- `supabase/functions/billing-suspend-overdue/index.ts`
- `supabase/functions/valor-webhook/index.ts`
- `supabase/migrations/20260908130000_merchant_billing_exemption.sql`
- `supabase/migrations/20260830130000_valor_saas_billing_lifecycle.sql`
