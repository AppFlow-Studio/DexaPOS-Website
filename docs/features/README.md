# Feature Documentation

Feature folders are the canonical home for product-specific documentation.
Search by product area first; dated filenames inside a folder preserve history
without hiding ownership.

| Feature | Scope |
| --- | --- |
| [`admin-platform/`](admin-platform/README.md) | Dexa HQ surfaces, shared admin UI, search, and operational screens |
| [`billing/`](billing/README.md) | Merchant billing, invoices, NMI billing, plans, add-ons, and quotas |
| [`cdn-assets/`](cdn-assets/README.md) | Bunny CDN and storage asset lifecycle |
| [`device-management/`](device-management/README.md) | Device registry, admin device UI, and Landi links |
| [`identity-access/`](identity-access/README.md) | Clerk linkage, RBAC, staff PINs, OTP, and account provisioning |
| [`inventory/`](inventory/README.md) | Inventory feature planning and remaining work |
| [`kds/`](kds/README.md) | KDS routing, state, station configuration, traceability, and health |
| [`location-management/`](location-management/README.md) | Single-location behavior, onboarding, and location UX |
| [`menu-management/`](menu-management/README.md) | Menus, categories, items, modifiers, recipes, and menu sync |
| [`merchant-management/`](merchant-management/README.md) | Merchant creation, business information, and onboarding |
| [`online-ordering/`](online-ordering/README.md) | Storefront setup, NMI checkout, OrderOut, and payment-origin operations |
| [`orders/`](orders/README.md) | Order lifecycle, receipts, delivery-platform identity, and payment-state behavior |
| [`pos-settings/`](pos-settings/README.md) | Website-managed location POS defaults and station overrides |
| [`qr-dine-in/`](qr-dine-in/README.md) | QR table ordering, analytics, payment, and handoff flows |
| [`reporting/`](reporting/README.md) | Merchant/HQ reports, source taxonomy, dates, and reportability |
| [`staff/`](staff/README.md) | Staff dashboard UI, timesheets, and shift adjustment |
| [`subscriptions/`](subscriptions/README.md) | Subscription tier behavior and QA |
| [`support-messaging/`](support-messaging/README.md) | Support tickets, email notifications, and Telnyx messaging |
| [`tables-floorplan/`](tables-floorplan/README.md) | Floor plans and table-management data contracts |
| [`website-builder/`](website-builder/README.md) | Merchant drag-and-drop website builder, section rendering, and publish pipeline |

If a document spans several features, place it under `docs/handoffs/` or the
appropriate cross-cutting engineering/quality folder and link to it from each
affected feature index.
