# Kitchen Display System

KDS routing, ticket state, station configuration, traceability, and operational
health contracts shared by the website, POS, and Supabase.

## Documents

- [PLAN-2026-08-14-KDS-ROUTING-TRACEABILITY.md](PLAN-2026-08-14-KDS-ROUTING-TRACEABILITY.md) - P0 immutable routing ledger, send-attempt evidence, trace RPC, health view, and POS handoff
- [FEATURE-2026-08-27-HQ-KDS-BOARD-MIRROR.md](FEATURE-2026-08-27-HQ-KDS-BOARD-MIRROR.md) - HQ mirror of what a station should be showing, plus board snapshots and replay
- [FEATURE-2026-08-27-HQ-KDS-SEND-LEDGER.md](FEATURE-2026-08-27-HQ-KDS-SEND-LEDGER.md) - HQ send-attempt ledger on the mirror page: did the server receive the send, and did every item apply? (plus the companion "unsent items" view)

## Maintenance

KDS database changes are shared contracts. Record the website/shared-database
work separately from POS client consumption and physical-screen QA. Routing
behavior changes must not be mixed into instrumentation-only migrations.
