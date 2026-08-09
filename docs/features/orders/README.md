# Orders

Order lifecycle, payment state, receipts, platform identity, and order-management contracts.

## Documents

- [BUG-void-order-payment-status-clobbers-collected-payment.md](BUG-void-order-payment-status-clobbers-collected-payment.md) - BUG â€” `void_order` clobbers payment dimension on paid-then-voided orders
- [order_management_guide.md](order_management_guide.md) - DEXA POS - Order Management & Sync System
- [PLAN-2026-06-29-DELIVERY-PLATFORM-LOGOS-WEB.md](PLAN-2026-06-29-DELIVERY-PLATFORM-LOGOS-WEB.md) - Delivery Platform Logos - Web Scope
- [PLAN-2026-08-09-AUD-9-PREVIOUS-ORDERS-KEYSET-RPC.md](PLAN-2026-08-09-AUD-9-PREVIOUS-ORDERS-KEYSET-RPC.md) - [POS-PERF] AUD-9 - `get_previous_orders_page_v1` keyset pagination RPC (DB half)
- [receipts-remove-if-paid-by-card-line.md](receipts-remove-if-paid-by-card-line.md) - [Receipts] Remove "If paid by card" alternative-price line â€” web, digital, SMS & email
- [REQUIREMENTS_CHECK.md](REQUIREMENTS_CHECK.md) - Order Management Requirements Compliance Check

## Maintenance

Update the existing canonical document when possible. Every feature change must record relevant contracts, dependencies, verification, manual QA, and remaining work in this folder.
