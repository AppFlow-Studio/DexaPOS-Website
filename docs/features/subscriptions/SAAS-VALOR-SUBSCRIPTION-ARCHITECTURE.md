# SaaS and Valor Subscription Summary

Last reviewed: 2026-09-03

## Core Model

Dexa has two subscription scopes:

1. **Merchant tier:** one plan for the entire merchant organization.
2. **Location subscription:** extra services and device charges for one location.

```text
Merchant
|
+-- One merchant-wide tier
|   +-- Stored in merchant_plan_subscriptions
|   +-- Billed through one location-backed anchor
|
+-- Location A add-ons
|   +-- Services, devices, and station quantities
|
+-- Location B add-ons
    +-- Independent services, devices, and quantities
```

The tier is not duplicated for every location. The billing anchor only supplies
the `location_id` required by the current invoice structure.

## Main Records

| Record | Scope | Purpose |
| --- | --- | --- |
| `merchant_plan_subscriptions` | Merchant | Current merchant-wide tier and status. |
| `merchant_subscriptions` | Location | Billing container for a location. One row also acts as the merchant-tier anchor. |
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
4. Dexa finds an active primary Valor billing profile.
5. Dexa uses one location subscription as the billing anchor.
6. Dexa creates the invoice and activates or updates the Valor schedule.
7. The tier remains active only if Valor approves the payment operation.
8. The merchant receives the approval or denial notification.

If Valor rejects the charge, Dexa restores the previous tier instead of granting
unpaid access.

### Billing anchor

The billing anchor is a technical requirement, not a location-specific tier.

- A merchant-global payment profile uses an active location as its invoice
  anchor.
- A location-specific primary profile uses that profile's location.
- Changing the dashboard location must not change the merchant's tier.
- The anchor row can contain both the merchant-tier base charge and that
  location's add-ons in one invoice and Valor schedule.

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
2. Enable services and set quantities.
3. Review the calculated recurring total.
4. Select `Create & Charge` or `Save & Charge`.
5. Valor must approve the operation before the new configuration becomes active.

Changing Location A must not affect Location B.

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

The merchant-tier anchor combines the tier base price with the anchor location's
add-ons. Other locations have independent billing streams.

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

## Main Code Areas

- `app/manage/actions/subscription-billing.ts`
- `app/dashboard/actions/subscription-billing.ts`
- `app/manage/subscriptions/[merchantId]/page.tsx`
- `app/dashboard/subscriptions/page.tsx`
- `supabase/functions/billing-charge-subscription/index.ts`
- `supabase/functions/billing-generate-monthly-invoices/index.ts`
- `supabase/migrations/20260830130000_valor_saas_billing_lifecycle.sql`
