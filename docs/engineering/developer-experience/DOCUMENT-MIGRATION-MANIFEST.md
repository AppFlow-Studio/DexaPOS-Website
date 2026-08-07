# Documentation Migration Manifest

This manifest records the website-only, content-preserving relocation prepared for the feature-based documentation restructure.

- Generated: 2026-08-02
- Moved artifacts: 112
- Content policy: organization only; source content is preserved
- Approval: Temur and Abubeckr required before publish/merge

## Retained In Place

- `README.md` - repository entry point
- `CLAUDE.md` - repository AI/workflow contract
- `.planning/` - tool-managed execution state
- SQL migration/source files - implementation artifacts, not documentation-only files

## Relocations

| Previous path | Canonical path |
| --- | --- |
| `docs/architecture-overview.md` | `docs/engineering/architecture/architecture-overview.md` |
| `utils/migrations/db_functions.md` | `docs/engineering/architecture/db_functions.md` |
| `utils/migrations/locations_rls_policy_optimization.md` | `docs/engineering/architecture/locations_rls_policy_optimization.md` |
| `docs/AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-COMBINED.md` | `docs/engineering/database-performance/AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-COMBINED.md` |
| `docs/AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-WEBSITE.md` | `docs/engineering/database-performance/AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-WEBSITE.md` |
| `docs/IMPLEMENTATION-BACKLOG-2026-08-01-SHARED-DATABASE-PERFORMANCE.md` | `docs/engineering/database-performance/IMPLEMENTATION-BACKLOG-2026-08-01-SHARED-DATABASE-PERFORMANCE.md` |
| `docs/SENIOR-SUMMARY-2026-07-31-SHARED-DATABASE-PERFORMANCE.md` | `docs/engineering/database-performance/SENIOR-SUMMARY-2026-07-31-SHARED-DATABASE-PERFORMANCE.md` |
| `docs/SQL-READONLY-2026-07-31-DATABASE-PERFORMANCE-AUDIT.sql` | `docs/engineering/database-performance/SQL-READONLY-2026-07-31-DATABASE-PERFORMANCE-AUDIT.sql` |
| `tasks/lessons.md` | `docs/engineering/developer-experience/lessons.md` |
| `docs/HANDOFF-2026-07-13-NEXT-16-UPGRADE.md` | `docs/engineering/framework-upgrades/HANDOFF-2026-07-13-NEXT-16-UPGRADE.md` |
| `tasks/c1-smoke-test-plan.md` | `docs/engineering/security/c1-smoke-test-plan.md` |
| `tasks/cve-patch-section-c-progress.md` | `docs/engineering/security/cve-patch-section-c-progress.md` |
| `tasks/BUG-hq-portal-shows-merchant-dba.md` | `docs/features/admin-platform/BUG-hq-portal-shows-merchant-dba.md` |
| `docs/SPRINT-2026-03-28-POPUP-STANDARDIZATION.md` | `docs/features/admin-platform/SPRINT-2026-03-28-POPUP-STANDARDIZATION.md` |
| `docs/SPRINT-2026-04-01-HQ-CREATION-PARITY-REBASE.md` | `docs/features/admin-platform/SPRINT-2026-04-01-HQ-CREATION-PARITY-REBASE.md` |
| `docs/SPRINT-2026-04-01-MERCHANT-POPUP-REDESIGN.md` | `docs/features/admin-platform/SPRINT-2026-04-01-MERCHANT-POPUP-REDESIGN.md` |
| `docs/SPRINT-2026-04-02-HQ-POPUP-WIDTH-TUNING.md` | `docs/features/admin-platform/SPRINT-2026-04-02-HQ-POPUP-WIDTH-TUNING.md` |
| `docs/SPRINT-2026-04-02-TRANSACTIONS-MERCHANT-INVENTORY-RESPONSIVE.md` | `docs/features/admin-platform/SPRINT-2026-04-02-TRANSACTIONS-MERCHANT-INVENTORY-RESPONSIVE.md` |
| `tasks/global-search-qa.md` | `docs/features/admin-platform/global-search-qa.md` |
| `tasks/info-icons-phase2-analytics.md` | `docs/features/admin-platform/info-icons-phase2-analytics.md` |
| `tasks/info-icons-phase3-merchant-detail.md` | `docs/features/admin-platform/info-icons-phase3-merchant-detail.md` |
| `tasks/info-icons-phase4-ops-surfaces.md` | `docs/features/admin-platform/info-icons-phase4-ops-surfaces.md` |
| `tasks/todo-dark-nav-twotone.md` | `docs/features/admin-platform/todo-dark-nav-twotone.md` |
| `docs/HANDOFF-2026-06-16-INVOICE-NMI-WEBHOOK.md` | `docs/features/billing/HANDOFF-2026-06-16-INVOICE-NMI-WEBHOOK.md` |
| `docs/HANDOFF-2026-07-13-BILLING-CONTROL-REMAINING-POS-ITEMS.md` | `docs/features/billing/HANDOFF-2026-07-13-BILLING-CONTROL-REMAINING-POS-ITEMS.md` |
| `docs/HANDOFF-2026-07-13-HQ-BILLING-CONTROL-FINAL.md` | `docs/features/billing/HANDOFF-2026-07-13-HQ-BILLING-CONTROL-FINAL.md` |
| `docs/PLAN-2026-05-09-NMI-DEXA-BILLING-RAIL.md` | `docs/features/billing/PLAN-2026-05-09-NMI-DEXA-BILLING-RAIL.md` |
| `docs/PLAN-2026-07-12-HQ-SELF-SERVICE-BILLING-CONTROL.md` | `docs/features/billing/PLAN-2026-07-12-HQ-SELF-SERVICE-BILLING-CONTROL.md` |
| `docs/SPRINT-2026-03-21-BUNNY-CDN-MIGRATION-PLAN.md` | `docs/features/cdn-assets/SPRINT-2026-03-21-BUNNY-CDN-MIGRATION-PLAN.md` |
| `docs/SPRINT-2026-04-28-BUNNY-STORAGE-ASSET-AUDIT.md` | `docs/features/cdn-assets/SPRINT-2026-04-28-BUNNY-STORAGE-ASSET-AUDIT.md` |
| `docs/SPRINT-2026-03-14-DEVICE-REGISTRY-FOUNDATION-PLAN.md` | `docs/features/device-management/SPRINT-2026-03-14-DEVICE-REGISTRY-FOUNDATION-PLAN.md` |
| `docs/SPRINT-2026-03-16-DEVICE-REGISTRY-ADMIN-UI-PLAN.md` | `docs/features/device-management/SPRINT-2026-03-16-DEVICE-REGISTRY-ADMIN-UI-PLAN.md` |
| `tasks/admin-web-landi-connect-quick-links.md` | `docs/features/device-management/admin-web-landi-connect-quick-links.md` |
| `docs/HANDOFF-2026-04-28-PHONE-VERIFICATIONS-RLS-OTP-HARDENING.md` | `docs/features/identity-access/HANDOFF-2026-04-28-PHONE-VERIFICATIONS-RLS-OTP-HARDENING.md` |
| `docs/PLAN-2026-06-22-BAY-RIDGE-OWNER-IDENTITY-RELINK.md` | `docs/features/identity-access/PLAN-2026-06-22-BAY-RIDGE-OWNER-IDENTITY-RELINK.md` |
| `docs/SPRINT-2026-02-15-ADMIN-ONBOARDING-RBAC-AUDIT-NOTES-PLAN.md` | `docs/features/identity-access/SPRINT-2026-02-15-ADMIN-ONBOARDING-RBAC-AUDIT-NOTES-PLAN.md` |
| `docs/SPRINT-2026-04-02-PLAINTEXT-STAFF-PIN-SETUP.md` | `docs/features/identity-access/SPRINT-2026-04-02-PLAINTEXT-STAFF-PIN-SETUP.md` |
| `tasks/webhook-staff-hardening-changelog.md` | `docs/features/identity-access/webhook-staff-hardening-changelog.md` |
| `tasks/inventory-remaining-work.md` | `docs/features/inventory/inventory-remaining-work.md` |
| `tasks/single-location-gap-plan.md` | `docs/features/location-management/single-location-gap-plan.md` |
| `tasks/single-location-gap.md` | `docs/features/location-management/single-location-gap.md` |
| `tasks/single-location-ux-nav-paywall-bell.md` | `docs/features/location-management/single-location-ux-nav-paywall-bell.md` |
| `docs/HANDOFF-2026-06-04-MODIFIER-DISPLAY-ORDER-FRONTEND.md` | `docs/features/menu-management/HANDOFF-2026-06-04-MODIFIER-DISPLAY-ORDER-FRONTEND.md` |
| `docs/INVESTIGATION-2026-06-10-SAUCY-POS-MENU-SYNC.md` | `docs/features/menu-management/INVESTIGATION-2026-06-10-SAUCY-POS-MENU-SYNC.md` |
| `docs/PLAN-2026-06-02-MODIFIER-REORDERING-SAFETY.md` | `docs/features/menu-management/PLAN-2026-06-02-MODIFIER-REORDERING-SAFETY.md` |
| `docs/PLAN-2026-06-04-MODIFIER-DISPLAY-ORDER-ALIGNMENT.md` | `docs/features/menu-management/PLAN-2026-06-04-MODIFIER-DISPLAY-ORDER-ALIGNMENT.md` |
| `docs/PLAN-2026-06-06-SINGLE-LOCATION-GLOBAL-MODIFIER-RECIPE-RPCS.md` | `docs/features/menu-management/PLAN-2026-06-06-SINGLE-LOCATION-GLOBAL-MODIFIER-RECIPE-RPCS.md` |
| `REACT_NATIVE_POS_MENU_ARCHITECTURE.md` | `docs/features/menu-management/REACT_NATIVE_POS_MENU_ARCHITECTURE.md` |
| `docs/SPRINT-2026-03-28-HQ-CATEGORY-POPUP-PILOT.md` | `docs/features/menu-management/SPRINT-2026-03-28-HQ-CATEGORY-POPUP-PILOT.md` |
| `docs/SPRINT-2026-03-28-HQ-MENU-PARITY.md` | `docs/features/menu-management/SPRINT-2026-03-28-HQ-MENU-PARITY.md` |
| `docs/SPRINT-2026-03-30-HQ-MENU-ITEM-POPUP-ROLLOUT.md` | `docs/features/menu-management/SPRINT-2026-03-30-HQ-MENU-ITEM-POPUP-ROLLOUT.md` |
| `docs/SPRINT-2026-03-30-HQ-MENU-OPERATIONS-POPUP-ROLLOUT.md` | `docs/features/menu-management/SPRINT-2026-03-30-HQ-MENU-OPERATIONS-POPUP-ROLLOUT.md` |
| `docs/SPRINT-2026-04-02-HQ-SCHEDULES-PRODUCT-POPUPS.md` | `docs/features/menu-management/SPRINT-2026-04-02-HQ-SCHEDULES-PRODUCT-POPUPS.md` |
| `tasks/category-flow-bugfix-changelog.md` | `docs/features/menu-management/category-flow-bugfix-changelog.md` |
| `docs/SPRINT-2026-04-02-HQ-BUSINESS-INFO-LOCATION-DETAILS.md` | `docs/features/merchant-management/SPRINT-2026-04-02-HQ-BUSINESS-INFO-LOCATION-DETAILS.md` |
| `tasks/merchant-creator-autogrant-plan.md` | `docs/features/merchant-management/merchant-creator-autogrant-plan.md` |
| `tasks/onboarding-first-location-loop-fix.md` | `docs/features/merchant-management/onboarding-first-location-loop-fix.md` |
| `tasks/BUG-orderout-outbound-status-relay.md` | `docs/features/online-ordering/BUG-orderout-outbound-status-relay.md` |
| `docs/FEATURE-ONLINE-ORDERING-DEJAVOO-DEVICE-MODEL.md` | `docs/features/online-ordering/FEATURE-ONLINE-ORDERING-DEJAVOO-DEVICE-MODEL.md` |
| `docs/FEATURE-ONLINE-ORDERING-PAYMENTS.md` | `docs/features/online-ordering/FEATURE-ONLINE-ORDERING-PAYMENTS.md` |
| `docs/FEATURE-ONLINE-STORE-HQ-REQUEST-FLOW.md` | `docs/features/online-ordering/FEATURE-ONLINE-STORE-HQ-REQUEST-FLOW.md` |
| `docs/HANDOFF-2026-04-11-SENIOR-ONLINE-ORDERING-DEJAVOO.md` | `docs/features/online-ordering/HANDOFF-2026-04-11-SENIOR-ONLINE-ORDERING-DEJAVOO.md` |
| `docs/HANDOFF-2026-05-04-NMI-ONLINE-ORDERING-HARD-CUT.md` | `docs/features/online-ordering/HANDOFF-2026-05-04-NMI-ONLINE-ORDERING-HARD-CUT.md` |
| `docs/HANDOFF-2026-05-04-NMI-ONLINE-ORDERING-HARD-CUT.pdf` | `docs/features/online-ordering/HANDOFF-2026-05-04-NMI-ONLINE-ORDERING-HARD-CUT.pdf` |
| `docs/RUNBOOK-PAYMENT-WHITELIST-SYNC.md` | `docs/features/online-ordering/RUNBOOK-PAYMENT-WHITELIST-SYNC.md` |
| `docs/SPRINT-2026-04-08-ONLINE-ORDERING-PAYMENTS-HANDOFF.md` | `docs/features/online-ordering/SPRINT-2026-04-08-ONLINE-ORDERING-PAYMENTS-HANDOFF.md` |
| `docs/WORKLOG-2026-04-12-ONLINE-STORE-HQ-ACCESS-CHANGES.md` | `docs/features/online-ordering/WORKLOG-2026-04-12-ONLINE-STORE-HQ-ACCESS-CHANGES.md` |
| `tasks/orderout-integration-handoff.md` | `docs/features/online-ordering/orderout-integration-handoff.md` |
| `tasks/orderout-source-surfacing-handoff.md` | `docs/features/online-ordering/orderout-source-surfacing-handoff.md` |
| `tasks/orderout-status-relay-handover.md` | `docs/features/online-ordering/orderout-status-relay-handover.md` |
| `tasks/orderout-status-relay-plan.md` | `docs/features/online-ordering/orderout-status-relay-plan.md` |
| `tasks/BUG-void-order-payment-status-clobbers-collected-payment.md` | `docs/features/orders/BUG-void-order-payment-status-clobbers-collected-payment.md` |
| `docs/PLAN-2026-06-29-DELIVERY-PLATFORM-LOGOS-WEB.md` | `docs/features/orders/PLAN-2026-06-29-DELIVERY-PLATFORM-LOGOS-WEB.md` |
| `REQUIREMENTS_CHECK.md` | `docs/features/orders/REQUIREMENTS_CHECK.md` |
| `utils/migrations/order_management_guide.md` | `docs/features/orders/order_management_guide.md` |
| `tasks/receipts-remove-if-paid-by-card-line.md` | `docs/features/orders/receipts-remove-if-paid-by-card-line.md` |
| `docs/PLAN-2026-06-30-LOCATION-POS-CONFIG-STATION-OVERRIDES-WEB.md` | `docs/features/pos-settings/PLAN-2026-06-30-LOCATION-POS-CONFIG-STATION-OVERRIDES-WEB.md` |
| `docs/HANDOFF-2026-05-24-QR-TRACK-B-CREATE-ONLINE-ORDER.md` | `docs/features/qr-dine-in/HANDOFF-2026-05-24-QR-TRACK-B-CREATE-ONLINE-ORDER.md` |
| `docs/PLAN-2026-05-20-QR-DINE-IN-FOUNDATION.md` | `docs/features/qr-dine-in/PLAN-2026-05-20-QR-DINE-IN-FOUNDATION.md` |
| `docs/PLAN-2026-05-22-QR-DINE-IN-TRACK-A.md` | `docs/features/qr-dine-in/PLAN-2026-05-22-QR-DINE-IN-TRACK-A.md` |
| `docs/PLAN-2026-05-27-QR-DINE-IN-UNIFIED.md` | `docs/features/qr-dine-in/PLAN-2026-05-27-QR-DINE-IN-UNIFIED.md` |
| `tasks/todo.md` | `docs/features/qr-dine-in/todo.md` |
| `docs/PLAN-2026-06-04-REPORTING-DATE-RANGE-BOUNDARIES.md` | `docs/features/reporting/PLAN-2026-06-04-REPORTING-DATE-RANGE-BOUNDARIES.md` |
| `docs/PLAN-2026-07-30-KIOSK-CHANNEL-REPORTING-WEB.md` | `docs/features/reporting/PLAN-2026-07-30-KIOSK-CHANNEL-REPORTING-WEB.md` |
| `tasks/recognized-order-predicate.md` | `docs/features/reporting/recognized-order-predicate.md` |
| `tasks/recognized-order-test-summary.md` | `docs/features/reporting/recognized-order-test-summary.md` |
| `docs/PLAN-2026-06-02-DASHBOARD-STAFF-SIDEBAR-POLISH.md` | `docs/features/staff/PLAN-2026-06-02-DASHBOARD-STAFF-SIDEBAR-POLISH.md` |
| `docs/PLAN-2026-06-29-TIMESHEETS-MANUAL-ADJUSTMENT-AUTO-CLOCKOUT.md` | `docs/features/staff/PLAN-2026-06-29-TIMESHEETS-MANUAL-ADJUSTMENT-AUTO-CLOCKOUT.md` |
| `docs/QA-2026-05-20-SUBSCRIPTIONS-TIERS-RESPONSIVE-AUDIT.md` | `docs/features/subscriptions/QA-2026-05-20-SUBSCRIPTIONS-TIERS-RESPONSIVE-AUDIT.md` |
| `docs/FEATURE-2026-07-28-HQ-SUPPORT-TICKET-CREATION-NOTIFICATIONS.md` | `docs/features/support-messaging/FEATURE-2026-07-28-HQ-SUPPORT-TICKET-CREATION-NOTIFICATIONS.md` |
| `docs/PENDING-SUPPORT-ENV-VARIABLES.txt` | `docs/features/support-messaging/PENDING-SUPPORT-ENV-VARIABLES.txt` |
| `tasks/PR_DESCRIPTION.md` | `docs/features/support-messaging/PR_DESCRIPTION.md` |
| `tasks/wire-up-hardening-support-marketing-telnyx.md` | `docs/features/support-messaging/wire-up-hardening-support-marketing-telnyx.md` |
| `utils/migrations/floorplan-and-table-guide.md` | `docs/features/tables-floorplan/floorplan-and-table-guide.md` |
| `docs/admin-guide.md` | `docs/guides/admin-guide.md` |
| `docs/merchant-guide.md` | `docs/guides/merchant-guide.md` |
| `docs/HANDOFF-2026-05-30-MAHMOUD-BUGFIX-TICKETS.md` | `docs/handoffs/HANDOFF-2026-05-30-MAHMOUD-BUGFIX-TICKETS.md` |
| `docs/HANDOFF-2026-06-10-SENIOR-RECENT-THREE-TICKETS.md` | `docs/handoffs/HANDOFF-2026-06-10-SENIOR-RECENT-THREE-TICKETS.md` |
| `docs/HANDOFF-2026-06-10-SENIOR-RECENT-THREE-TICKETS.pdf` | `docs/handoffs/HANDOFF-2026-06-10-SENIOR-RECENT-THREE-TICKETS.pdf` |
| `docs/HANDOFF-2026-06-30-LATEST-TICKETS-SENIOR-REVIEW.md` | `docs/handoffs/HANDOFF-2026-06-30-LATEST-TICKETS-SENIOR-REVIEW.md` |
| `docs/HANDOFF-2026-06-30-LATEST-TICKETS-SENIOR-REVIEW.pdf` | `docs/handoffs/HANDOFF-2026-06-30-LATEST-TICKETS-SENIOR-REVIEW.pdf` |
| `APPFLOW-STUDIO-CAFE-END-TO-END-QA-INTERNAL-TRACKER.md` | `docs/quality/end-to-end/APPFLOW-STUDIO-CAFE-END-TO-END-QA-INTERNAL-TRACKER.md` |
| `APPFLOW-STUDIO-CAFE-END-TO-END-QA.md` | `docs/quality/end-to-end/APPFLOW-STUDIO-CAFE-END-TO-END-QA.md` |
| `tasks/load-001-order-throughput.md` | `docs/quality/load-testing/load-001-order-throughput.md` |
| `tasks/load-002-realtime-fanout.md` | `docs/quality/load-testing/load-002-realtime-fanout.md` |
| `tasks/load-003-sync-flaky-network.md` | `docs/quality/load-testing/load-003-sync-flaky-network.md` |
| `tasks/load-tests-section-c-handoff.md` | `docs/quality/load-testing/load-tests-section-c-handoff.md` |
| `docs/QA-2026-07-02-IN-PROGRESS-TICKETS-CLOSURE-MATRIX.md` | `docs/quality/qa-tracking/QA-2026-07-02-IN-PROGRESS-TICKETS-CLOSURE-MATRIX.md` |
| `docs/QA-FULL-TICKET-TEST-SCENARIOS-2026-04-24.md` | `docs/quality/qa-tracking/QA-FULL-TICKET-TEST-SCENARIOS-2026-04-24.md` |
| `docs/REFERENCE-EMERGENCY.md` | `docs/reference/REFERENCE-EMERGENCY.md` |
| `docs/FEATURE-TEMPLATE.md` | `docs/templates/FEATURE-TEMPLATE.md` |
| `docs/ALL-TICKETS-REFERENCE.md` | `docs/tickets/ALL-TICKETS-REFERENCE.md` |
