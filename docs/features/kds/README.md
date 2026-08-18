# Kitchen Display System

KDS routing, ticket state, station configuration, traceability, and operational
health contracts shared by the website, POS, and Supabase.

## Documents

- [PLAN-2026-08-14-KDS-ROUTING-TRACEABILITY.md](PLAN-2026-08-14-KDS-ROUTING-TRACEABILITY.md) - P0 immutable routing ledger, send-attempt evidence, trace RPC, health view, and POS handoff

## Maintenance

KDS database changes are shared contracts. Record the website/shared-database
work separately from POS client consumption and physical-screen QA. Routing
behavior changes must not be mixed into instrumentation-only migrations.
