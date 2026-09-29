# `/manage/users` — design-system conversion (Family 5, list page)

**Date:** 2026-09-29 · **Branch:** `Haydar-AdminRestructure` · **Spec:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

Converts the HQ user directory onto Part A and §14. Presentation only: no query, server action or
permission behaviour changes, except the fixes recorded below.

## Scope

| File | Notes |
|---|---|
| `app/manage/users/page.tsx` | converted |
| `app/manage/users/loading.tsx` | hand-rolled `Card` skeleton → `DataPageSkeleton variant="report"` (§14.4) |
| `app/manage/users/[userId]/**` | **not in this pass** — detail page, still pending |
| `organizations/[organizationId]/components/AdminInviteWizard.tsx` | opened from this page but shared with org detail; its colour gaps stay on the §14.8 list |

## Work items

- [x] Shell: `PageShell as="div"`, `PageHeader` (h1 + subtitle, "Invite Admin" action); hand-rolled `text-3xl font-bold` h1 gone
- [x] KPIs: three `<Card>`s → one `Panel > StatRow columns={3}`, above the tabs because they cover both. Green/yellow icons → neutral. Fake metas ("+2 from last month", "85% of total users") → real ones (active share is computed)
- [x] Tabs: bordered two-column `TabsList` → pill rail (§4.5)
- [x] Users tab: filter `Card` + table `Card` → one `Panel padded` holding toolbar, table well and pager (skeleton A)
- [x] Toolbar: muted search with `/50` icon, borderless filter selects, "Clear filters" pill only when a filter is set; filters reset paging
- [x] Table: `variant="data"`, `min-w-[800px]`, shown from `xl` (its fit breakpoint, §5.3); record cards below with a stretched link, plain-text values, avatars hidden below `sm`
- [x] Status and role as neutral `Badge variant="outline"` (was per-role/per-status variants incl. `destructive` and bare default fills)
- [x] Merchants column `text-right tabular-nums`; dates `tabular-nums`, day in the cell, full timestamp in `title`
- [x] Paged at 10 (`useClientPagination` + `PaginationBar`), with a count line when it fits on one page
- [x] Worded empties for no users / no filter matches (table and cards), and for invites
- [x] Neutral error well with Retry (was a bare `<div>Error: …</div>`)
- [x] Row menu shared by row and card (`UserRowMenu`); Activate neutral (was green), Deactivate `variant="destructive"` (was yellow)
- [x] Invites tab: `divide-y rounded-md border` lists → `bg-muted/45` record rows, status as a word, paged at 10; Revoke `variant="destructive"` (was `text-red-600`)
- [x] Edit role dialog: tinted `bg-primary/10` icon chip, red/orange/blue per-level rings, dots and code pills, and the `bg-primary` radio → neutral selected state (`bg-muted ring-1 ring-border`); clip/scroll structure; `role="radiogroup"`/`radio`
- [x] Temp password dialog: `rounded-md border` well → `rounded-2xl bg-muted/60`

## Behaviour changes beyond presentation

| Where | Change | Why |
|---|---|---|
| Role filter | Options are the HQ roles (`hq.super_admin` …) instead of "Admin / Manager / User / Support" | `members.role` holds role codes, so every old option matched zero rows |
| Role column | Shows the role name (`Super Admin`), not the raw code | Humanised |
| "Last Active" column | Renamed **"Updated"** | The value is the profile's `updated_at`, not a sign-in time |
| Invite search | Now filters by name, email or role | The input had no state and did nothing |
| Search | Null-safe on missing first/last names | `null.toLowerCase()` would have thrown |
| "Add User" dialog | Removed | Its trigger was `className="hidden"` and it listed hardcoded fake organizations; unreachable |
| Invites tab | Duplicate "Invite Admin" button removed | The header action covers both tabs |
| Table row | The user's name is a real `<Link>` | Rows were mouse-only |

## Found, not changed

- **"Copy invite link"** (admin and member invites) and **Resend / Revoke on member invites** have no handlers — they do nothing. Needs a product decision: wire them or drop them.
- **Pending invites tile** counts from `useOrganizationUsers`, while the Invites tab lists from `useOrganizationInfo`. Two sources for one fact.
- **Deactivate** still confirms with `window.confirm`, not a centred confirmation dialog.
- **`AdminInviteWizard`** keeps its decorative colour (§14.8).

## Verification

- [x] `tsc --noEmit --incremental false`: 263 project errors, **0 in `app/manage/users/`**
- [x] ESLint on both files: no findings
- [x] §3.5, §5.5, §8, §12 / C6 / §4.6b greps: no hits
- [x] Exactly one `PageShell`, `as="div"`, per render branch
- [ ] Browser: light + dark at 1440 / 1280 / 1024 / 375 — **not run** (Chrome DevTools MCP failed to connect). Worth checking: the `xl` table/card switch, the stretched card link vs. its menu, the role dialog full-screen on phones.
