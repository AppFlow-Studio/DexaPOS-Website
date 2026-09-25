# Database Performance

Shared database audits, evidence queries, senior decisions, and remediation backlog.

## Documents

- [AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-COMBINED.md](AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-COMBINED.md) - Shared Supabase/Postgres Performance and Architecture Audit - Combined POS and Website
- [AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-WEBSITE.md](AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-WEBSITE.md) - Shared Supabase/Postgres Performance and Architecture Audit - Website
- [IMPLEMENTATION-BACKLOG-2026-08-01-SHARED-DATABASE-PERFORMANCE.md](IMPLEMENTATION-BACKLOG-2026-08-01-SHARED-DATABASE-PERFORMANCE.md) - Shared Database Performance Implementation Backlog
- [SENIOR-SUMMARY-2026-07-31-SHARED-DATABASE-PERFORMANCE.md](SENIOR-SUMMARY-2026-07-31-SHARED-DATABASE-PERFORMANCE.md) - Senior Summary - Shared Database Performance Audit
- [SQL-READONLY-2026-07-31-DATABASE-PERFORMANCE-AUDIT.sql](SQL-READONLY-2026-07-31-DATABASE-PERFORMANCE-AUDIT.sql) - SQL-READONLY-2026-07-31-DATABASE-PERFORMANCE-AUDIT.sql
- Supabase connections and storage: diagnosis, fix plan, status and deployment runbook (2026-09-24). The canonical document lives in the POS repo: `Dexa-POS/docs/engineering/database/SUPABASE-CONNECTIONS-AND-STORAGE-2026-09-24.md`. Website side: branch `db/connections-and-storage`; migrations `supabase/migrations/20260925120000` through `20260925124000`, each with a rollback in `supabase/migrations/rollback/`.

## Maintenance

Update the existing canonical document when possible. Every feature change must record relevant contracts, dependencies, verification, manual QA, and remaining work in this folder.
