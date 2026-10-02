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

---

## Audit against the 2026-09-30 rules

**Date:** 2026-09-30. Re-checked the whole route (list, both tabs, every dialog, `[userId]` with its four tabs and three dialogs, both loading states) against `UI-DESIGN-SYSTEM.md` after D-25–D-28 landed. Read-only: nothing changed yet.

### List page — `page.tsx` (converted 2026-09-29; drift from the new table rules)

- [ ] **Breakpoint (§5.3, D-26).** Table is `hidden xl:block` with an unprefixed `min-w-[800px]`; cards are `xl:hidden`. Tablets and 1024px laptops get cards. → table `hidden md:block`, cards `md:hidden`, drop the `min-w`. Tiers: essential = User, Role, Status, menu; `lg` = Merchants, Joined; `xl` = Updated.
- [ ] **Rows two lines tall (§5.7).** The User cell stacks name over email with an `h-8` avatar. → email becomes `lg`-tier, or its own `xl` column; keep rows one line.
- [ ] **Phone card carries everything (§5.3, D-27).** Email line + 5 pairs (Role, Status, Merchants, Joined, Updated); status is a pair, not on the lead line. → lead: name + status; pairs: Role, Merchants; drop email, Joined, Updated (all on the detail page).
- [ ] **Temporary-password dialog is full-screen on phones (§13.1).** It is a short two-button dialog, so it should stay a centred card (`dialog.tsx` makes everything full-screen below `sm` by default; see the `ManualBatchoutDialog` override).
- [ ] **Deactivate confirms with `window.confirm` (§12).** → centred confirmation `Dialog`, centred card on phones. (Already in "Found, not changed".)
- [x] Paged at 10, count line, `PaginationBar` (§5.7) · no inner scroll (`bounded={false}`, §5.7/D-25) · row links to its own page (§5.9) · neutral badges (§4.6b) · worded empties and error well (§4.9) · pill rail (§4.5) · `PageShell as="div"` (§14.1) · no lines (§5.5).

### Detail page — `[userId]/page.tsx` (never converted; fails most rules)

**Structure**
- [ ] No `PageShell as="div"` / `PageHeader`; bare `div space-y-6` (§2 C, §14.1).
- [ ] Text breadcrumb instead of a back control (§4.4) → `PageHeader backHref="/manage/users" backLabel="Back to Users"`.
- [ ] Hand-written `h1 text-3xl font-bold` (D-01).
- [ ] The whole tab area sits inside the header's flex row, indented by an `h-20` avatar + `space-x-6`: at 375px the content column is ~230px (§13.3). Tabs belong below the header at full width.
- [ ] Four `<Card>` imports (C6, §9) → `Panel` / `PanelSection`.
- [ ] Default `TabsList` (§4.5) → the pill rail used on the list page.
- [ ] Error state: red icon + red "Error: …" text, `h-screen`, outside any shell, no Retry (§4.9). Not-found state also outside the shell.

**Colour (§3.5, §4.6b)**
- [ ] Avatar fallback `bg-orange-500 text-white`; membership fallback `bg-gray-500 text-white` (§8).
- [ ] Status: green/red/yellow dot + text (`getStatusColor`, `getStatusDot`) → the word in a neutral pill.
- [ ] "Verified" pill `bg-green-100 text-green-800` — and it is hardcoded for every user, so it is also untrue.
- [ ] Super-admin callout `border-blue-200 bg-blue-50 text-blue-800` + blue icon → `rounded-2xl bg-muted/60 px-4 py-3`.
- [ ] View-only: `text-yellow-600` "(View only)" and a `bg-yellow-50 border-yellow-200` callout → neutral.
- [ ] Merchant-access rows: tinted `bg-primary/10 text-primary` icon chip; hardcoded green "Active" pill (every row, carries no information).
- [ ] Revoke `X`: `text-red-600 hover:bg-red-100` → `variant="ghost"` + `text-destructive`. Danger zone: `text-red-600` / `border-red-200` → the `destructive` token (§3.5 use 3 allows the Danger Zone, not raw hues).
- [ ] Loading spinner `border-primary` → skeleton in the final shape (§5.4).

**Lines and surfaces (§5.5, §3.1)**
- [ ] `border-t` above "Edit user details".
- [ ] Access rows `rounded-lg border bg-muted/30` → `rounded-2xl bg-muted/45`, no border.

**Lists and tabs**
- [ ] Merchant-access list is unpaged (§5.7) → page at 10 with `PaginationBar`; a record list, so rows on `md`+ and essential-only cards below.
- [ ] Revoke is an icon-only button with no `aria-label` (§13.6) and no confirmation (§12).
- [ ] Memberships: no empty sentence when there are none (§4.9); role shown as the raw code (`hq.super_admin`), unlike the list page's `roleName()`; "Remove from organization" has no handler and uses `text-red-600` instead of `variant="destructive"`.
- [ ] "OAuth profile picture" row prints the raw avatar URL.
- [ ] **Sessions and Events tabs are permanent placeholders** ("No session data available" — the banned bare copy, §4.9). Nothing feeds them. Product decision: wire them or remove the tabs.
- [ ] Captions (`CardDescription`) and the avatar don't drop below `sm` (§13.4) — automatic once on `PanelSection`/`PageHeader`.

### Detail-page dialogs

- [ ] **`edit-membership-dialog.tsx`** — duplicates the list page's "Edit role" dialog (same `changeAdminUserRole`) but in the pre-conversion style: `bg-primary/10` chip, red/orange/blue per-level `ROLE_LEVEL_COLOR` (§3.5), amber callout, `rounded-lg border` options, `bg-primary` radio, no `radiogroup` semantics. → extract the list page's converted picker into one shared component and use it in both places.
- [ ] **`grant-merchant-access-dialog.tsx`** — `border-b` header / `border-t` footer (§5.5); `bg-primary/10` chip; `bg-orange-100` logo fallback, logos kept on phones (§13.4); green/yellow status pills (§4.6b); `bg-primary/8 ring-primary` selected state → `bg-muted ring-1 ring-border`; list is a fixed `max-h-72` well rather than the `flex-1 min-h-0` scroller (§12), so the full-screen phone dialog leaves dead space; search icon not `/50` (§4.2a).
- [ ] **Bug (functional):** the page loads merchants with `useMerchants(DEFAULT_MERCHANT_FILTERS, 1)`, default `pageSize` 20, and the dialog searches client-side. Merchants past the first 20 can never be granted.
- [ ] **Delete user** confirmation is full-screen on phones by default (§13.1) → centred card.
- [x] `edit-user-details-dialog.tsx` conforms (muted inputs, form → full-screen on phones, no lines).

### Shared, out of this route's scope

- `AdminInviteWizard` (opened by "Invite Admin"): `bg-primary` stepper fills, `bg-primary/5 ring-primary` selection, `text-emerald-600`, `bg-yellow-50` callout, `bg-primary/10` chip, `border-t`, `<Separator />`. Shared with org detail; already on the §14.8 list.

---

## Fix pass — 2026-09-30

**Decisions (from the user):** wire up the Sessions and Events tabs; make every dead invite and membership action work.

**Findings that shaped the work**
- `pending_org_member_invites` does not exist; the "Member invites" section could never render. Member invites now come from Clerk: pending organization invitations that have no `pending_org_admin_invites` row.
- `RemoveUser`, `ClerkResendInvitationAdmin` and `ClerkRevokeInvitation` checked no permission. They are server actions, so any signed-in caller could delete a Clerk user or revoke an HQ invite.
- Removing a membership must go through Clerk only: the `organizationMembership.deleted` webhook does the cascade (location members, staff profiles), and it no-ops if the `members` row is already gone.

### Backend
- [x] `hq-invitations.ts`: member invites from Clerk, invite link (`OrganizationInvitation.url`), resend and revoke for member invites. Guard: `hq.team.manage` for the HQ org, `hq.org.manage` otherwise.
- [x] Same guard on `ClerkResendInvitationAdmin` / `ClerkRevokeInvitation`.
- [x] `RemoveUser`: super admin only, never yourself; logs `ADMIN_DELETED` (it logged `ADMIN_DEACTIVATED`).
- [x] `removeUserFromOrganization`: super admin, not yourself, last-admin guard, Clerk `deleteOrganizationMembership`, `ADMIN_MEMBERSHIP_REMOVED`.
- [x] `admin-user-activity.ts`: `getAdminUserSessions` (Clerk sessions), `revokeAdminUserSession` (super admin, `ADMIN_SESSION_REVOKED`), `getAdminUserEvents` (audit rows the user did or that targeted them, server-paged at 10; needs `system.audit.view`).
- [x] Grant dialog searches merchants server-side, so merchants past the first 20 are reachable.

### Shared UI
- [x] `ConfirmDialog` in the shell: a centred card at every width (§13.1).
- [x] `HqRolePicker`: the converted role list, used by the list page's "Edit role" and the detail page's "Edit membership".

### List page
- [x] Table from `md`, tiered columns, one-line rows; phone cards with the essentials (D-26, D-27, §5.7).
- [x] Deactivate and temp-password dialogs centred on phones; deactivate uses `ConfirmDialog`.
- [x] Tab, search, filters and page kept in the URL, so back from a user lands on the same page (§5.9).
- [x] Copy invite link, and member invites with working resend and revoke.

### Detail page
- [x] Skeleton C: `PageShell as="div"`, `PageHeader` with back pill, pill-rail tabs below the header.
- [x] Details: profile, memberships (edit, remove), danger zone (super admins, not yourself).
- [x] Merchant access: table/cards, paged at 10, revoke with confirmation, neutral callouts.
- [x] Sessions: Clerk sessions, table/cards, revoke an active session.
- [x] Events: audit history, server-paged at 10.
- [x] Dialogs: grant access and edit membership converted; delete user via `ConfirmDialog`.

### Review fixes (independent review of the diff)
- [x] Delete user now has the last-admin guard too (`lib/admin/org-admins.ts`, shared by delete, deactivate and remove-membership; kept out of `'use server'` files so it is not a callable endpoint)
- [x] "Back to Users" restores the list's page and filters: list links carry `?back=<list query>` (§5.9)
- [x] Table rows are one real overlay link (opens in a new tab), not `onClick` navigation (§5.9)
- [x] URL writes use `history.replaceState`, so typing in search no longer round-trips to the server
- [x] Phone cards carry exactly the `md` columns: Merchants, Location and By moved off the cards (§5.3)
- [x] Member-invite actions refuse admin-invite ids; a resend that revokes but fails to re-send says so, and the list refetches either way
- [x] Grant dialog no longer claims "no merchants left" when only the first 20 matches are granted
- [x] Pre-existing `set-state-in-effect` lint errors in both edit dialogs fixed

### Found, not changed (outside this route)
- `getPlatformAuditLogs`: the existing `search` and `actor` filters interpolate raw user text into a PostgREST `.or()` (filter injection). The new `involvesUserId` filter is validated.
- `/manage/organizations/[organizationId]` has the same dead "Copy invite link" item and the same never-populated `pending_org_member_invites` section. The new actions in `org-invitations.ts` work for any org, so wiring it is a page change only.
- `RemoveUserPopup` (org detail) now fails for non-super admins, because `RemoveUser` is super-admin only.

### Verify
- [x] `tsc --noEmit --incremental false`: 0 errors in touched files (project total 836, all pre-existing elsewhere)
- [x] ESLint on touched files: 0 errors (one pre-existing warning in `analytics.ts`)
- [x] §3.5 / §5.5 / §8 greps clean on touched files (the one hit is a comment naming `window.confirm`)
- [x] Events filter checked read-only against the database: the `metadata->>…` `or` parses, 766 rows for a real HQ user, first page of 10
- [ ] Browser pass — not run: the Chrome DevTools MCP failed to connect this session

---

## Follow-ups — 2026-10-01

- [x] "Invite Admin" → "Invite user" (`/manage/users`, `/manage`); the wizard says "user" for HQ (a Manager is not an admin) and keeps "admin" for other orgs
- [x] Chrome autofill wrote the viewer's email into the search box: both searches are now their own `<form role="search">` with `autoComplete="off"`; the wizard's name/email fields are `autoComplete="off"`
- [x] Wizard: removed the body lines that repeated the step description (Role, Merchants); the Merchants note no longer restates it
- [x] Invite menus follow the invite's state: pending → copy link, resend, revoke; revoked/expired → "Send again"; accepted → no menu. `ClerkResendInvitationAdmin` no longer tries to revoke an invite that is not pending
- [x] "Actions" label removed from the user, invite and membership menus
- **Found, not changed (database, out of scope; this work is UI-only).** The app defines three HQ roles, but the `roles` table also holds six legacy HQ roles (51 `role_permissions` rows, no members or other references) and has Platform Admin at level 9, not 8. The UI only ever offers the three roles from `HQ_ROLES`, so nothing visible depends on this. A cleanup migration was drafted and deleted unapplied.
- [x] Invite rows on phones: name and status lead, then email and role; "Invited by" and the date join from `md` (D-27)
- [x] Profile tab rail: `no-scrollbar`, active tab kept centred by the new shell hook `useRailAutoScroll` (§13.2). Org detail moved onto the same hook; it measures with rects, so the rail needs no `relative`
- [x] Header: `PageHeader` now keeps the subtitle with the title, so on a phone the order is title, subtitle, actions. Before, the subtitle rendered after the wrapped action buttons (every page with a subtitle and actions)
- [x] Skeletons shaped like each page at laptop and phone width (`app/manage/users/components/skeletons.tsx`): `UsersDirectorySkeleton`, `UserProfileSkeleton`, and `RecordListSkeleton` (table well from `md`, cards below) for each profile tab. Used by `loading.tsx`, the Suspense fallback and the in-page state
- [x] No spinners on the route: removed from `ConfirmDialog`, the role, grant and edit-details dialogs, and the invite wizard (its merchant step now loads as a skeleton)
- [x] New rule §4.10 / D-29 in `UI-DESIGN-SYSTEM.md`: every page loads as a skeleton of itself at laptop and phone width, never a spinner
