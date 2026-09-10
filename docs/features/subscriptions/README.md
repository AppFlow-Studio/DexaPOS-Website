# Subscriptions

Subscription tiers, responsive behavior, and validation.

## Documents

- [SAAS-VALOR-SUBSCRIPTION-ARCHITECTURE.md](SAAS-VALOR-SUBSCRIPTION-ARCHITECTURE.md) - Merchant tiers, location add-ons, device mappings, invoices, and Valor recurring billing
- [QA-2026-05-20-SUBSCRIPTIONS-TIERS-RESPONSIVE-AUDIT.md](QA-2026-05-20-SUBSCRIPTIONS-TIERS-RESPONSIVE-AUDIT.md) - Subscription Tier Video Flow + Responsive Audit Checklist
- [VALOR-RECURRING-E2E-2026-09-07.md](VALOR-RECURRING-E2E-2026-09-07.md) - First sandbox E2E of the recurring rail: error cascade, SUB08/A40 fixes, and the A44 resolution (wrong `payment_info` keys — must be `CustomerProfileID`/`PaymentProfileID`, not cross-host; verified `S00` on staging 2026-09-10)
- [VALOR-BILLING-PROD-PROMOTION-CHECKLIST.md](VALOR-BILLING-PROD-PROMOTION-CHECKLIST.md) - Gating checklist to promote recurring/SaaS billing to production (A44 blocker CLEARED, prod creds/host, migration reconciliation, edge fn deploy, webhook, cutover, verification gates)

## Maintenance

Update the existing canonical document when possible. Every feature change must record relevant contracts, dependencies, verification, manual QA, and remaining work in this folder.
