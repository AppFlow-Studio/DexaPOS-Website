# `/manage/audit-logs` — design-system conversion (Family 5)

**Date:** 2026-09-29 · **Branch:** `Haydar-AdminRestructure` · **Spec:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

Converts the platform audit log onto Part A and §14. Presentation only: the query, filters, CSV export, anomaly
detection and localStorage flags behave as before, except for the changes listed below. The impersonation sub-page
(`…/impersonation`) was converted separately, the same day.

## Scope

| File | Consumers |
|---|---|
| `app/manage/audit-logs/page.tsx` | this route |
| `components/admin/MerchantSearchSelect.tsx` | this route only |

Reuses `app/manage/transactions/components/ledger-primitives.tsx` (`RecordCard`, `CardField`, `FilterSelect`,
`FilterDate`, `LoadError`, `TableEmptyRow`, `CardGridEmpty`). A second route now imports them, which makes the case for
the §11 item "a shared mobile record card + `CardField`": promote the file to `components/dashboard/shell`.

## Work items

- [x] Shell: `PageShell as="div"` + `PageHeader`, with Refresh / Export CSV as pill controls (§4.1, §14.1)
- [x] Tabs: the underline strip became the pill rail (§4.5). Counts are plain muted `tabular-nums`, with no `bg-primary/10` chip
- [x] Filters: the `Card` became a toolbar inside `Panel > PanelSection` (§5.2). Raw `<select>`s became `FilterSelect`, native date inputs became `FilterDate`, and the checkbox became a DS-CTL-03 toggle chip. Visible labels and the card description went; each control has an `aria-label`. Controls sit two to a row on phones. "Clear filters" shows only while a filter is set
- [x] Merchant picker: a muted, borderless trigger (§4.2) and a `rounded-2xl` popover (§4.6). Also fixes the width class: `w-[--radix-popover-trigger-width]` compiles to `width: --radix-…` in Tailwind 4.3, so the popover never matched the trigger. It is now `w-[var(--radix-popover-trigger-width)]`
- [x] Table: `variant="data"`. The `max-h-[62vh]` wrapper well, the `rounded-md border` frame and the `bg-card` header override are gone (§5.2, §5.7). It shows from `2xl`, where `min-w-[1150px]` fits
- [x] Record cards below `2xl` (§5.3): the sentence and time lead, fields sit underneath, and the card has Flag and Details controls. The row and the card render the same `AuditEventDetail`
- [x] Colour (§3.5, §4.6b): per-type org, severity, status and role pills became neutral words. Tinted failed, anomaly and flagged rows became weight. The amber flag icon is now neutral, with `aria-pressed`. The anomaly banner and the error box are now neutral wells with words. The red/green diff wells became old value struck through → new value (§14.6.4)
- [x] No lines (§5.5): the diff lost its `divide-y` and border, and the tabs lost their `border-b`
- [x] Empty and error states (§4.9): the copy depends on the filters, and an empty Flagged tab says "All clear — nothing flagged among events 1–50 of N". A query error shows a neutral well with Retry. An export failure shows a neutral well with Retry, and the cap note is neutral too (it was amber)
- [x] Paging (§5.7): `PaginationBar` at 10 per page on both tabs, with a row-count line when everything fits on one page. Expanded rows collapse when the page or tab changes
- [x] Accessibility: icon buttons have `aria-label`s, the expand control has `aria-expanded` and a rotating chevron (§7), and the diff carries `sr-only` "changed from … to"

## Behaviour changes beyond presentation

| Where | Change | Why |
|---|---|---|
| Paging | 50 per page became 10 per page. The server is still asked for 50 rows at a time; the pager slices that window and fetches the next window when needed | §5.7, and anomaly detection keeps its 50-event window (a 10-row page could never contain "5 voids in an hour") |
| Flagged tab | Now paged at 10, and a caption says which events it covers ("among events 51–100 of N") | The tab only ever covered the loaded window; before, it didn't say so |
| Category column | `user_management` is shown as "User Management" | Humanised labels (§14.6.2) |
| Anomaly and error detail | Moved to the top of the expanded detail | They are the reason to open the row |

## Found, not changed

- **Flags and anomalies only cover the loaded window.** A flagged event on another page is invisible on the Flagged tab, and bursts that span two 50-row windows go undetected. This predates the conversion. Fixing it needs server-side detection or flag storage.
- **Flags live in localStorage**, so they are per browser and are not shared between HQ admins.
- **`useState(() => loadFlaggedIds())`** reads localStorage during the first client render, so the bookmark icons can mismatch the server HTML on hydrate.
- **`getPlatformAuditLogs` returns `{ data: [], total: 0 }` on a query error**, so most failures read as "No audit events yet". Only a thrown error (for example, a permission failure) reaches the new error well.
- The same broken `w-[--radix-popover-trigger-width]` class is still in `ModifierRecipeManager.tsx:452` and `components/support/AssigneeEmailMultiSelect.tsx:74`.

## Verification

- [x] `tsc --noEmit --incremental false`: 0 errors in either changed file (841 project-wide, from other uncommitted work in the tree)
- [x] ESLint compared with `HEAD`: the page went from 2 errors + 3 warnings to 2 errors. The remaining two are the same pre-existing "reset page in an effect" pattern. `MerchantSearchSelect` is unchanged (2 pre-existing)
- [x] §3.5, §4.6b, §5.5, §8 and §12 greps are clean for both files. No bare `<Badge>`, no `Card`, no raw `<select>`, no `rounded-md`
- [x] Tailwind 4.3 compile check for the new variants (`aria-pressed:`, `@md:`, `@3xl:`, `@container`) and for the `w-[var(--radix-popover-trigger-width)]` fix
- [ ] Browser: light + dark at 1536 / 1280 / 375 — **not run** (the Chrome DevTools MCP failed to connect this session). Worth checking: the `2xl` table/card switch, the expanded detail in a card at 375px, the toolbar grid on phones, and the pressed "Has error" chip in dark mode
