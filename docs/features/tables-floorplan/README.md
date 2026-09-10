# Tables and Floor Plans

Floor-plan and table-management database and UI contracts.

## Documents

- [floorplan-and-table-guide.md](floorplan-and-table-guide.md) - ðŸ½ï¸ DEXA POS - Floor Plan & Table Management System

## Related

- [qr-dine-in/PLAN-2026-09-06-TABLE-QR-RELOCATION.md](../qr-dine-in/PLAN-2026-09-06-TABLE-QR-RELOCATION.md) - Tables owns a QR surface at `/dashboard/tables/qr-codes` (generate, print, revoke table codes). The scan-to-order *policy* stays on Online Ordering; the codes are keyed by `floor_plan_objects`, which is why they live here.

## Maintenance

Update the existing canonical document when possible. Every feature change must record relevant contracts, dependencies, verification, manual QA, and remaining work in this folder.
