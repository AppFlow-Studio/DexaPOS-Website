# Timesheets: weekly/monthly hours per staff, summary grid + CSV export (read-only)

**Date:** 2026-09-15
**Ticket:** [Web · Timesheets] Weekly / monthly hours breakdown per staff (Notion `3dc8280c-1b1d-8129-92e6-f2632e4300db`). Assignee Ali Awdi, Medium, MERCHANT.
**Branch:** `feat/timesheets-summary-grid`, cut from `dexaposwebsite-preview`.
**Surface:** `/dashboard/staff/timesheets`
**Design (7 artboards, sample data):** <https://claude.ai/artifact/MzPBegY8MbmQ7rPkiZQt72>. Source files are in [`design/timesheets/`](design/timesheets/).
**Status (2026-09-16):** Built on `feat/timesheets-summary-grid` (uncommitted). Migration applied to Dev. §9 decided: every recommendation taken. Outstanding: seeded QA data, the DoD screen recording and reviewer sign-off — see the [build record](#11-build-record-2026-09-16).

> **Data blocker set aside.** The ticket's "wrong punch data" evidence comes from the production DB (Saucy). This plan is built and verified against the Dev DB (`dfwqakoyittmrwbqvxgw`, the ref in `.env`). The grid is designed to *surface* bad punches rather than hide them (§2.6).

---

## 0. Ticket claims checked against the code and the live Dev DB

The ticket was verified fact by fact before planning (lessons.md, 2026-09-08: read a ticket's stated cause as a hypothesis). Nine claims needed correcting:

| # | Ticket says | Reality (verified 2026-09-15) | Consequence for this plan |
|---|---|---|---|
| 1 | Net hours "must match `handle_time_clock_v2`'s arithmetic exactly" | `handle_time_clock_v2` does **no** arithmetic; it only stamps `now()`. Three different hours formulas exist today and disagree: the web `calculateShiftDuration`, `admin_adjust_staff_shift`, and `rebuild_employee_daily_tips`. | This plan **defines** the one canonical formula (§3.2) in SQL. The grid, the Shifts view and both CSVs all use it. |
| 2 | `break_logs` is `[{start,end,type}]` | Two key shapes are live. The POS writes `{start,end,type}`; web adjustments write `{id,type,start_at,end_at,duration_minutes}`. | Today the web page and CSV **ignore every POS break**. The new formula reads both shapes. |
| 3 | Rate may be missing (`0` or null) | `hourly_rate_snapshot` is `NOT NULL DEFAULT 0`. It is copied from `location_members.hourly_rate` at clock-in, so a missing rate is always `0`. | `rate_missing := hourly_rate_snapshot = 0` |
| 4 | Auto clock-out (ticket `3898280c`) "Done", status unclear | It is **live on Dev**: `auto_clock_out_stale_shifts()`, cron every 15 min, and `locations.auto_clock_out_enabled` / `auto_clock_out_time`. It is **absent from repo migrations**, and our own [2026-06-29 plan](PLAN-2026-06-29-TIMESHEETS-MANUAL-ADJUSTMENT-AUTO-CLOCKOUT.md) wrongly says it never shipped. It is enabled nowhere on Dev. | Out of scope. Auto-closed shifts get a "Closed automatically" source badge (§3.5). Flagged in §10. |
| 5 | Cell click → **side sheet** | Design system D-13 bans sheets for panels. | Centred `Dialog`, full screen below `sm`. |
| 6 | `⚠` markers on rows | Design system D-12: status is never colour-coded. | Neutral pills and icons; the word carries the meaning. |
| 7 | Month → week columns **W1–W5** | With Monday-start weeks a month can span **6** (August 2026: Aug 1 is a Saturday). | Month columns are the month's weeks **clipped to the month**, 4–6 of them. |
| 8 | Month overtime "summed from the weekly computation" | Undefined for a week split across two months. | Overtime is allocated **per shift, chronologically** within the full workweek (§3.3). Any bucket is then a plain sum. |
| 9 | The grid *replaces* the flat punch list | That list is the **only** way into *Adjust shift* (shipped 2026-06-29). | The list stays as a **Shifts** view one switch away (lessons.md, 2026-08-18: deleting UI can orphan a feature). |

Also found:
- `ShiftAdjustmentDialog` loads POS breaks with blank times, so a manager correcting a POS shift cannot save without deleting its breaks. Fixed here in §4.4, because the Shifts view keeps this dialog.
- Security and bug items outside this ticket are listed in §10.

---

## 1. Scope

**In**
- Period controls: Week / Month / Custom, with a stepper.
- A summary grid (employees × days or weeks) with Total, Overtime and Est. pay.
- Header tiles: Total hours, Overtime hours, Estimated labor cost.
- A "Needs review" strip that filters the grid.
- A Day detail dialog.
- A Shifts view: the existing list restyled onto one data source.
- Summary and Shift detail CSVs.
- One read RPC, an index, a server action, pure aggregation and CSV modules with tests, and the POS-break fix in the adjust dialog.

**Out**
- Punch editing beyond the existing *Adjust shift*.
- Approval, period locking, and payroll-provider submission (ticket `3478280c`).
- Auto clock-out changes.
- A per-location overtime setting (unless §9 decides otherwise).
- Daily overtime (California > 8h/day).
- The business-day hour (§9 Q5).
- The HQ `/manage` timesheets copy.

---

## 2. UX specification

The design system rules (`docs/UI-DESIGN-SYSTEM.md`) govern every choice below. Where a pattern already exists in the dashboard, this page reuses it rather than inventing one:

| Need | Reused from |
|---|---|
| Page frame, header, tiles | `PageShell`, `PageHeader`, `LocationIndicator`, `Panel`, `PanelSection`, `StatRow`/`StatTile` |
| Table | `<Table variant="data">`, laid out like `StaffDataTable` (the canonical table) |
| Week / Month / Custom rail | Reports page pill rail + `ScrollableTabsBar` |
| Period stepper | `ScheduleManager` week stepper (`rounded-full bg-muted/60 p-1`, ghost `icon-sm` arrows, `tabular-nums` label) |
| Custom range | `DateRangePicker` |
| Filter chips | DS-CTL-03 (filter chip), the same pattern as the QR manager's tile filters |
| Drill-in | Centred `Dialog` with the overlay scroll structure (§12 of the DS) |

### 2.1 Page anatomy, top to bottom

1. **`PageHeader`**
   - Back to Staff · **Timesheets** · 📍 location · **Export ▾** (outline pill).
   - Subtitle: "Hours worked by each team member, by week or month."
2. **Control row** (no panel; governs everything below):
   - **Rail:** Week · Month · Custom
   - **Stepper:** `‹ Sep 7 – 13, 2026 ›`, `‹ August 2026 ›`, or the `DateRangePicker` trigger when Custom is selected.
   - **"This week" / "This month"** ghost pill, shown only when you are away from the current period.
   - **Next arrow** is disabled once the period starts after today.
3. **Tiles panel.** `StatRow columns={3}`:

   | Tile | Meta line |
   |---|---|
   | Total hours | "12 team members · 57 shifts" |
   | Overtime hours | "2 people over 40 hours" |
   | Estimated labor cost | "Not counted: 1 person with no pay rate" when any rate is missing |

   *Active shifts* is dropped, per the ticket.
4. **Hours panel.** `PanelSection`, icon `Users`, heading **Hours by team member**:
   - The heading's `action` slot holds a **Summary | Shifts** rail.
   - **Toolbar:** search on the left; on the right, "Needs review" followed by the chips, then *Clear filters*.
   - **Grid** (desktop), or a **card list** below `xl`.
   - **Count line:** "Showing 12 of 12 team members". On the right it states how numbers are computed: "Hours count on the day a shift starts · Eastern Time · Weeks run Mon–Sun".

### 2.2 The grid

- **Columns:**
  - Team member, sortable. Avatar initials, name, role.
  - One column per bucket.
  - Total, sortable.
  - Overtime, sortable.
  - Est. pay, sortable.
  - **Week:** 7 day columns. Header shows "Mon" with "Sep 7" beneath; today's column shows "Today".
  - **Month:** 4–6 clipped-week columns. Header shows "Aug 10–16" with "Week 3" beneath; edge weeks show "Sat–Sun" or "Mon".
  - **Custom:** day columns when the range is 14 days or fewer, clipped weeks otherwise. The maximum is 92 days.
- **Footer band:** "Daily total" (or "Weekly total"), with the same `bg-muted/50` treatment as the header, **no rule** (§5.5). This is not in the ticket. Per-day labor hours is the second question every manager asks, and it costs nothing because it is a sum of the payload.
- **Cells:**
  - Hours show as decimals with 2 places (`8.00`), right-aligned, `tabular-nums`. Decimals are what payroll imports, and 2 places is the industry norm; the ticket's 1 place hides 5-minute differences.
  - An empty day shows `—` in `text-muted-foreground`.
  - A month cell with overtime shows `9.00 OT` stacked beneath in 11px muted text.
  - Each cell is a `<button>` shaped as a `rounded-full` pill. Hover and focus give `bg-muted` plus `ring-1 ring-border`.
- **Markers.** All are neutral, all have an `sr-only` label and a `title`:

  | Marker | Meaning |
  |---|---|
  | `Moon` | A shift that day ends the next day |
  | `Hourglass` | A shift over 16 h |
  | `CircleAlert` + "Missing" | A shift with no clock-out (0 h counted) |
  | "On clock" | A shift in progress now (§9 Q4) |

- **No rate:** Est. pay shows `—` with "No pay rate" beneath. **Never `$0.00`** (ticket AC). A person with a rate who worked 0 h shows a muted `$0.00`, which is true.
- **Rows:** every active member of the location appears, even with zero hours (absence is signal), plus anyone with shifts in the period who has since left, marked "No longer active".
- **Default sort:** name A–Z.
- **Sticky first column:** `sticky left-0`. The row fill `bg-card/70` is translucent, so the sticky cell needs an **opaque** equivalent or the day cells show through underneath it when scrolling sideways.
- **No virtualisation** (the ticket asks for it past 40 rows). 100 staff × 11 cells is 1,100 buttons, trivial for React. Cost is dominated by the RPC. Add `@tanstack/react-virtual` only if profiling shows dropped frames; it would complicate the sticky column and the card list.

### 2.3 Interactions

| Action | Result |
|---|---|
| Day cell | **Day detail** dialog for that person and day (§2.4). Instant, because the data is already in the payload. |
| Week cell (month view) | Switches to Week view for that week. |
| Name | Shifts view filtered to that person and period. This is the ticket's "full period detail", and reuses the list rather than building a second one. |
| Review chip | Filters rows to affected people and rings the affected cells. The chip turns `bg-muted text-foreground` with an ✕. |
| Clear filters | Shown only when a filter is off its default (§5.2). |
| Summary ↔ Shifts | Same period and filters; the URL updates. |

**URL state** (shareable, back-button safe, survives refresh):
`?view=summary|shifts&period=week|month|custom&start=YYYY-MM-DD&end=YYYY-MM-DD&review=missing|long|norate&member=<staff_profile_id>&q=`. Written with `router.replace`, never `push`, while stepping.

### 2.4 Day detail dialog

- **Header:** name, then "Tuesday, Sep 8, 2026 · Bartender"; circular ✕ close button (DS-CTL-08).
- **Three inset tiles:** Worked · Unpaid breaks · Est. pay (with the rate). For a missing clock-out, a neutral notice replaces them: "This shift has no clock-out. Its hours aren't counted in any total until a clock-out is added. A manager can add one from the shift list."
- **One nested card per shift:**
  - Clock in and clock out, **each with its date** (ticket AC).
  - Net hours.
  - Source pills: *Clocked on POS* · *Edited by manager* · *Closed automatically* · *Ends the next day*.
  - Break rows showing type, time range and minutes.
- **Footer** (no rule):
  - Ghost link "All of Jordan's shifts this week →" (or "Open in shift list →") goes to the Shifts view.
  - Outline **Close**.
- Nothing in it can edit a shift (ticket AC: read-only).

### 2.5 Shifts view (the existing list, restyled)

- Same data source as the grid: the RPC's shift rows. Numbers therefore match by construction.
- **Columns:** Team member · Clock in · Clock out (**both dated**, with a moon when overnight) · Breaks · Hours · Est. pay · Status (neutral pill, plus "Edited") · ⋯ (**Adjust shift**, View details).
- **Toolbar:** search, then the team-member select, then Clear filters.
- `SHIFT_STATUS_STYLES` (green/blue/red/amber) is deleted; one neutral pill replaces it (D-12).
- The Status filter drops *Approved* and *Rejected*, which the live CHECK forbids.
- "View details" opens the Day detail dialog scoped to that one shift. `ShiftDetailsDialog.tsx` (`bg-white shadow-lg`, `rounded-xl`) is then orphaned and gets deleted. Its only caller is `page.tsx`.

### 2.6 Needs review

| Chip | Counts | Why it's there |
|---|---|---|
| Missing clock-out | Shifts with no clock-out that started more than 16 h ago | The 319-hour row from the ticket would have shown up here instead of being buried in a total |
| Over 16 hours | Closed shifts with net > 16 h | Catches a forgotten clock-out that was "closed" by the next clock-in |
| No pay rate | People whose shifts have `hourly_rate_snapshot = 0` | Explains the gap in labor cost |

- A chip appears only when its count is above 0.
- With nothing to review, the strip shows "✓ Nothing needs review this week" in muted text.
- Thresholds come from the RPC `meta`, never from the client.

### 2.7 Export

- **Export ▾** opens a dropdown with **Summary** ("CSV · as shown") and **Shift detail** ("CSV · one row per shift").
- File names follow `timesheets-{summary|shifts}_{location-slug}_{start}_{end}.csv`.
- **Serialised from the already-fetched payload** by the same pure functions that render the screen, so the files cannot drift from it (ticket AC).
- Uses `papaparse.unparse`.
- Cells starting with `= + - @` are prefixed with `'` (CSV formula injection).
- A UTF-8 BOM is added so Excel opens accented names correctly.
- **Summary CSV:** one row per person, one column per bucket, then Total, Overtime and Est. pay; a Total row last. It honours the current search and review filter, which is what "as rendered" means.
- **Shift detail CSV:**
  - Columns: staff, local date, clock-in and clock-out as **full ISO 8601 with offset**, unpaid and paid break minutes, net hours, overtime hours, rate, est. pay, flags.
  - Always the full period, ignoring the view filters.
- Every export writes `LogAuditEvent({ action: "timesheet_exported", actionCategory: "staff" })`: wage data leaving the system should leave a trail.

### 2.8 Phones and tablets (below `xl`)

- The tiles stack.
- The review chips scroll horizontally, and the active chip calls `scrollIntoView({inline:'center', block:'nearest'})` (§13.2).
- One **card per person** (`rounded-2xl bg-muted/45 p-4`):
  - Name and role on the left; Total (20px) with its meta line on the right.
  - A 7-cell Mon–Sun strip (or W1–W6): each cell is a tappable 44px-high tile.
  - Est. pay, plus a ghost "Shifts ›" link.
- Dialogs are full screen (`h-dvh`).
- Must hold at 375px with no horizontal body scroll.

### 2.9 States

| State | Behaviour |
|---|---|
| All-locations scope | Unchanged: "Select a location" (the page is per-location) |
| First load | Skeleton rows that keep the grid geometry (the `StaffDataTable` pattern) |
| Stepping periods | `placeholderData: keepPreviousData`; the old period stays at `opacity-60` until the new one lands, so there's no flash and no layout jump |
| No team members | Empty well: "No one works at {location} yet" + **Go to Staff** |
| Error | Inline in the panel with **Try again**; plus a toast. `PERMISSION_DENIED` gets its own message: "You don't have access to timesheets at this location." |

### 2.10 Copy rules

- "Team member", not "employee" or "staff" (matches the Staff page).
- "Missing clock-out", not "unclosed shift".
- "No pay rate", not "rate_missing".
- Hours are always "hours" or "hrs", never "h".
- Sentence case everywhere.

---

## 3. Computation contract (single source of truth)

### 3.1 Definitions
- **Timezone:** `locations.timezone` (NOT NULL, default `America/New_York`). Every boundary and label uses it, never the server's or the browser's timezone.
- **Shift day:** the local calendar date of `clock_in_time`. An overnight shift belongs to the day it started (ticket).
- **Workweek:** Monday 00:00 to Sunday 24:00 local (§9 Q1). DST-safe bounds are `(d::timestamp) AT TIME ZONE tz`, copied from `20260817120000_online_orders_board_business_day_strict.sql:90-93`.

### 3.2 Net minutes per shift
Implemented as SQL helper `public.timesheet_shift_minutes(clock_in timestamptz, clock_out timestamptz, break_logs jsonb)`, which returns `(net int, unpaid_break int, paid_break int)`.

```
gross        = clock_out − clock_in                       (open shift → all three are 0)
for each break entry e:
  start      = COALESCE(e->>'start_at', e->>'start')::timestamptz
  end        = COALESCE(e->>'end_at',   e->>'end')::timestamptz        (NULL end → ignored)
  type       = COALESCE(NULLIF(e->>'type',''), 'unpaid')               (same default as the adjust RPC)
  clamp [start, end] to [clock_in, clock_out]              (1 live break ends after its shift)
unpaid       = Σ clamped unpaid breaks   (overlaps merged, so double-logged breaks don't double-count)
net_seconds  = GREATEST(gross − unpaid, 0)
net          = ROUND(net_seconds / 60)   → integer minutes; every figure above is built from these
```

Hours displayed = `minutes / 60`, shown to 2 decimals. A total is formatted from summed **minutes**, so a row total can differ from adding its rounded cells by 0.01. Payroll systems behave the same way; the CSVs and the screen share the formatter, so they are identical.

### 3.3 Overtime (per shift, chronological)
For each person and workweek, order their closed shifts by `clock_in_time` and keep a running total of `net`:

```
ot(shift) = LEAST(net, GREATEST(running_after − threshold, 0))       threshold = 2400 min (40 h)
```

The last hours worked in a week are the overtime hours, which is how the FLSA counts it. Because overtime is a per-shift fact:
- Week overtime = Σ ot over the week = `GREATEST(week_total − 40h, 0)`, exactly the ticket's rule.
- **Any** bucket (day, clipped month-edge week, custom range) is a plain sum, with no recomputation on the collapsed bucket.
- The RPC reads from the Monday **before** `p_start` to the Sunday **after** `p_end`, so the running totals are correct, then returns only shifts whose shift day falls inside `[p_start, p_end]`.
- Open shifts count 0 and don't advance the running total.

### 3.4 Pay
- `rate = hourly_rate_snapshot` (per shift, so a mid-week raise is honoured).
- A rate of `0` means `pay = NULL` and `rate_missing = true`.
- `pay_cents = TRUNC(((net − ot) × rate + ot × rate × 1.5) / 60 × 100)` (§9 Q3). Pay is **truncated per shift**, and every aggregate is an integer **sum of shift cents**. Every total is then exactly the sum of the rows beneath it, so the Shift detail CSV adds up to the Summary CSV to the cent.
- Money is `NUMERIC` in SQL and integer cents on the wire. There are no float dollars anywhere.

### 3.5 Flags per shift
| Flag | Rule |
|---|---|
| `is_open` | `clock_out_time IS NULL` |
| `is_on_clock` | open **and** `clock_in_time > now() − max_shift` (in progress, not a problem) |
| `is_missing_out` | open **and not** on clock |
| `is_overnight` | local date of `clock_out` > local date of `clock_in` |
| `is_over_max` | closed **and** net > 960 min |
| `is_edited` | `is_verified` **and** `notes` not starting with the auto-close prefix |
| `is_auto_closed` | `notes LIKE 'Auto clock-out (system)%'`. Brittle string match; a column is suggested in §10. |
| `from_pos` | `device_id IS NOT NULL` |

---

## 4. Backend

### 4.1 Migration `supabase/migrations/2026091612xxxx_timesheet_summary.sql`
- [x] `timesheet_shift_minutes(...)`: `IMMUTABLE`, `SET search_path = 'public','pg_temp'`.
- [x] `get_timesheet_summary(p_location_id uuid, p_start date, p_end date) RETURNS jsonb`:
  - **Security:** `SECURITY DEFINER`, `SET search_path = 'public','pg_temp'`.
  - **Authz:** copy the pattern from `20260629120003_admin_adjust_staff_shift.sql`, i.e. `IF NOT (is_merchant_admin(v_merchant_id) OR user_has_location_permission(p_location_id, 'location.team.view')) THEN RAISE EXCEPTION 'PERMISSION_DENIED'`. The caller is resolved via `current_user_id()` (= `auth.jwt()->>'sub'`), **never `auth.uid()`**. `location.team.view` is held by owner, admin, manager and shift_manager (§9 Q7).
  - **Guards:** `p_end >= p_start`, span of 92 days or less (else `RANGE_TOO_LARGE`), location exists (else `NOT_FOUND`).
  - **Returns:**
    ```json
    { "meta":      { "timezone", "week_starts_on": "monday", "ot_threshold_minutes": 2400,
                     "ot_multiplier": 1.5, "max_shift_minutes": 960, "generated_at" },
      "employees": [{ "staff_profile_id", "display_name", "first_name", "last_name", "avatar_url",
                      "role_name", "is_active_member" }],
      "shifts":    [{ "id", "staff_profile_id", "local_date", "clock_in", "clock_out", "status",
                      "net_minutes", "unpaid_break_minutes", "paid_break_minutes", "ot_minutes",
                      "rate", "pay_cents", "flags": {…§3.5}, "breaks": [{ "type", "start", "end", "minutes" }],
                      "break_logs" /* raw, for the adjust dialog */, "notes", "is_verified" }] }
    ```
  - **The ticket's `p_granularity` parameter is dropped.** Buckets are sums of shift rows (§3.3), so the client can switch day/week/month without a refetch. Returning shift grain is also what makes the drill-in instant and the Shift detail CSV possible from one payload.
- [x] `CREATE INDEX IF NOT EXISTS idx_staff_shifts_location_clock_in ON staff_shifts (location_id, clock_in_time);`. Only an open-shift partial index exists today.
- [x] `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated, service_role;` (the pattern from `20260815161000_secfix_secdef_authz_and_search_path.sql`).
- [x] Rollback: `supabase/migrations/rollback/<same_ts>_timesheet_summary_rollback.sql`.
- [x] Validate the SQL against a real Postgres before applying (lessons.md, 2026-07-21). Apply to Dev, then regenerate `database.types.ts` **and** `app/database.types.ts`.

### 4.2 Server action: `app/dashboard/actions/timesheets.ts`
- [x] `GetTimesheetSummary({ clerkOrgId, locationId, start, end })`:
  - Uses `createServerSupabaseClient()`, which carries the Clerk JWT. **Not** service role: it has no `sub`, so the authz check would fail, and it would bypass RLS.
  - Calls `.rpc('get_timesheet_summary', …)`, then Zod-parses the payload. Returns `{ data?, error? }`, mapping `PERMISSION_DENIED`, `RANGE_TOO_LARGE` and `NOT_FOUND` to user copy.
  - A read, so no audit event.
- [x] `LogTimesheetExport({ clerkOrgId, locationId, kind, start, end, rowCount })` writes the audit event from §2.7.

### 4.3 Hook: `hooks/useTimesheetSummary.ts`
- [x] Query key `["timesheet-summary", clerkOrgId, locationId, start, end]`, `enabled: !!clerkOrgId && !!locationId`, `placeholderData: keepPreviousData`, `staleTime: 60_000`.
- [x] The *Adjust shift* success path invalidates `["timesheet-summary"]`, so the grid and list refresh together.

### 4.4 Fix in the existing adjust dialog
- [x] `ShiftAdjustmentDialog.tsx:78-79`: read `start_at ?? start` and `end_at ?? end`. Without this, POS breaks load blank and a POS shift cannot be corrected without losing its breaks.
- [x] Format its date-time inputs in the **location** timezone, not the browser's. It currently uses browser-local `toLocalDateTimeInput`.

---

## 5. Frontend: files

| File | Change |
|---|---|
| `app/dashboard/staff/timesheets/page.tsx` | Rewritten as a thin orchestrator: location gate, URL state, hook, layout. |
| `…/timesheets/components/PeriodControls.tsx` | New: rail, stepper, "This week", custom picker. |
| `…/timesheets/components/TimesheetStats.tsx` | New: 3 tiles. |
| `…/timesheets/components/ReviewChips.tsx` | New: chips, clear, empty line. |
| `…/timesheets/components/SummaryGrid.tsx` | New: `<Table variant="data">` plus the `xl:hidden` card list. |
| `…/timesheets/components/DayDetailDialog.tsx` | New. Replaces `ShiftDetailsDialog.tsx`, which gets deleted. |
| `…/timesheets/components/ShiftsTable.tsx` | New: the restyled list. Replaces `columns.tsx`, which gets deleted. |
| `…/timesheets/components/ExportMenu.tsx` | New. |
| `…/timesheets/ShiftAdjustmentDialog.tsx` | The §4.4 fixes only. |
| `lib/timesheets/period.ts` | New: week, month and custom bounds; clipped buckets; labels; next/prev; "is current". |
| `lib/timesheets/summary.ts` | New, pure: shift rows go in; buckets, row totals, footer, tiles, review sets and sorting come out. |
| `lib/timesheets/csv.ts` | New, pure: summary and detail rows, injection guard, BOM, file names. |
| `lib/timesheets/format.ts` | New: minutes → `8.00`, cents → `$1,016.49`, and `Intl.DateTimeFormat` date/time in the location timezone. |
| `hooks/useTimesheets.ts`, `utils/exportTimesheets.ts` | Their only consumer is this page. After the swap, grep for callers; if none, delete them. `GetTimesheets` stays until the §10 security fix decides its fate. |

All classes are written literally in `.tsx`. Tailwind doesn't scan `.ts` (C7), so the `lib/timesheets/*` modules return data, never class names.

---

## 6. Phases and tasks

**Phase 0: decisions**
- [x] Answers to §9 Q1–Q7, from the user or from Temur and Abubeckr.

**Phase 1: SQL** (§4.1)
- [x] Helper, RPC, index, grants, rollback.
- [x] Check the Dev data against hand-computed values:
  - Uptown's 13 overnight shifts (last 90 days) bucket on their clock-in day.
  - The >16 h shifts show as `is_over_max`.
  - Its open shifts show as missing or on clock.
  - The adjusted (web-shape) breaks and POS-shape breaks both deduct.
- [x] Authz probes: owner → OK; mikedoe (shift manager) → OK; another merchant's owner, a random `sub`, and no claims → `PERMISSION_DENIED`. *A user holding only `location.team.view` (not a merchant admin) could not be tested — every Clerk user at Joe's is admin/manager.*

**Phase 2: pure modules and tests** (`tests/timesheets/*.test.ts`, vitest)
- [x] `period`:
  - Week/month/custom bounds.
  - August 2026 → 6 clipped weeks.
  - A custom range of more than 14 days → weeks.
  - DST weeks (Mar 8 and Nov 1, 2026, America/New_York) keep day boundaries exact.
- [x] `summary`:
  - Bucket sums.
  - Month overtime equals the sum of week overtime.
  - Footer = Σ rows.
  - Tiles = Σ.
  - No-rate exclusion.
  - Zero-hour members present.
- [x] `csv`:
  - The summary CSV matches what `summary.ts` renders.
  - Detail CSV cents sum to the summary total.
  - The injection guard and the BOM.
- [x] `format`: 2-decimal hours; cents formatting; location-timezone formatting independent of the machine's timezone (run with `TZ=Asia/Beirut`).

**Phase 3: action and hook** (§4.2–4.3)
- [x] Server action, Zod schema, hook, and regenerated types.

**Phase 4: summary UI** (§2.1–2.4, §2.6, §2.8–2.9)
- [x] Period controls wired to URL state.
- [x] Tiles.
- [x] Grid: sticky column, footer, markers, sort.
- [x] Cards below `xl`.
- [x] Review chips.
- [x] Day detail dialog.
- [x] Loading, stale, empty and error states.

**Phase 5: Shifts view** (§2.5, §4.4)
- [x] `ShiftsTable` on the RPC rows.
- [x] Row menu: Adjust shift and View details.
- [x] Member filter from a name click.
- [x] Adjust dialog fixes.
- [x] Delete `columns.tsx` and `ShiftDetailsDialog.tsx`.
- [x] Check for orphans: grep every export of the deleted files for remaining callers.

**Phase 6: export** (§2.7)
- [x] Export menu, both CSVs, audit event.

**Phase 7: verification**
- [x] `tsc` on the touched files; vitest green on `tests/timesheets/*` (the suite has pre-existing failures unrelated to this work).
- [x] The design-system self-check greps (§9 of the DS) are clean on every new file: no `border-b|border-t|divide-y|<Separator`, no status colours, no `hsl(var(`.
- [x] Browser QA with the Playwright recipe, as merchant `mikedoe`, on Uptown Branch:
  - Week, month and custom views.
  - Stepping.
  - Drill-in with a dated clock-out.
  - A review chip catching an open shift.
  - A `—` Est. pay row.
  - Both CSVs opened next to the screen.
  - Shifts view → Adjust shift → the grid refreshes.
  - Light mode **and dark mode inside the dashboard route** (C4); 375 px.
- [ ] A cross-tenant attempt shown on screen. *(Verified at the SQL level only — see the build record; still needed on screen for the recording.)*
- [ ] **QA data.** Dev has 28 Uptown shifts in 90 days and almost every rate is 0, which cannot show overtime or pay. A seed script (`scratch`, never a migration) is needed: 12 members with rates, 2 full weeks including overtime, overnight, >16 h, open, no-rate and a DST week. **It writes to the shared Dev DB, so it runs only with an explicit go-ahead.**
- [ ] Screen recording per the ticket's DoD, reviewed by Abubeckr or Temur (the implementer cannot self-verify).
- [x] Update this doc with the results; add a README entry.

---

## 7. QA matrix
The ticket's matrix, plus this plan's additions:

| Case | Expected |
|---|---|
| Shift crossing midnight | Counted on its clock-in day; moon in grid and detail; clock-out dated |
| Open shift, started more than 16 h ago | 0 h, "Missing" cell, counted in *Missing clock-out*, not in Total |
| Open shift, started less than 16 h ago | "On clock" cell, **not** a review item (§9 Q4) |
| POS-shape break `{start,end}` | Deducted (it isn't today) |
| Break logged past clock-out | Clamped to the shift |
| Member with zero shifts | Row present, all `—`, Total `0.00` |
| Member who worked two locations | Only this location's hours |
| Week spanning a month end | Week view unaffected; month view clips the week, and overtime still uses the full week |
| August 2026 | 6 week columns |
| DST week | No 23 h or 25 h drift in day boundaries; durations are real elapsed time |
| `hourly_rate_snapshot = 0` | Est. pay `—` "No pay rate"; excluded from the labor tile, whose meta line says so |
| Mid-week raise | Each shift priced at its own snapshot |
| Cross-tenant `p_location_id` | `PERMISSION_DENIED`, with friendly copy |
| Summary CSV vs screen | Identical figures (same formatter) |
| Σ Detail CSV pay vs Summary total | Equal to the cent |
| Name containing `=cmd` | Prefixed `'` in the CSV |
| 40 staff × 31 days | RPC < 300 ms; page interactive < 2 s |
| Adjust a POS shift with a break | The break loads with its times; save succeeds; grid refreshes |

---

## 8. Risks
- **The truth moves.** Fixing the formula (POS breaks now deduct) means hours on the Shifts view and in the CSV will **drop** for POS shifts with breaks compared with today. That's correct, but visible. Call it out in the release note.
- **`is_auto_closed` is a string match** on `notes`, and *Adjust shift* overwrites `notes`. Acceptable for a badge; not reliable for reporting (§10).
- **Schema drift.** Auto clock-out objects exist live but not in the repo. Verify live columns before any DDL (lessons.md, 2026-07-14).
- **The Dev DB is shared.** The seed script must be scoped to one location and reversible.

---

## 9. Open decisions
| # | Question | Recommendation | Why |
|---|---|---|---|
| Q1 | Week start | **Monday** | The ticket's grid and ISO-week overtime. The page uses Sunday today, so this is a visible change. |
| Q2 | Overtime threshold | **40 h/week, as an RPC constant** in `meta`; per-location setting later | No settings surface exists; the constant is one line to lift later. |
| Q3 | Est. pay includes the 1.5× overtime premium? | **Yes** | The ticket's sample figures price overtime at 1×, which understates labor cost; US law requires 1.5×. |
| Q4 | Is an in-progress shift a review item? | **No.** Show "On clock"; flag only after 16 h | Otherwise every busy day shows a false alarm for everyone currently working. |
| Q5 | Day boundary | **Calendar midnight** (ticket) | `business_day_end_hour` (Uptown = 5) is used by tips. Revisit if payroll wants business days. |
| Q6 | Month view | **Clipped week columns** (the ticket's recommendation) | Keeps the month total equal to the calendar month. |
| Q7 | Who can view | **`location.team.view`** or merchant admin | The same four roles as *Adjust shift*, and export follows view. Tighten export to `location.reports.export` if wages need a narrower audience. |

---

## 10. Found during research, outside this ticket (each needs its own ticket)
| Severity | Finding |
|---|---|
| **High** | `auto_clock_out_stale_shifts(p_now)` is `EXECUTE`-granted to `anon`, and its authz check is skipped when `auth.uid()` is null. An anonymous caller can pass `p_now` and force-close shifts at any location with auto clock-out enabled. |
| **High** | `GetTimesheets` uses the service-role client and trusts a `clerkOrgId` sent from the browser, with no membership or location check. That is an IDOR on staff hours and wages. This page stops calling it (§5); the function and the HQ copy still need fixing. |
| Medium | `BulkApproveShifts` and `UpdateShiftStatus(…,'approved')` always fail: `staff_shifts_status_check` allows only `active`, `on_break` and `completed` (error 23514). |
| Medium | Auto clock-out function, cron job and columns are live but missing from the repo migrations. The 2026-06-29 plan doc wrongly says the feature is unshipped. |
| **High** | **NULL-authz bypass (found while building, 2026-09-16).** With no `org_id` claim in the Clerk JWT, `is_dexapos_admin()` returns NULL, so `is_merchant_admin()` / `user_has_location_permission()` return NULL — not false — for an outsider. `IF NOT (NULL) THEN RAISE` does not raise. `admin_adjust_staff_shift` uses exactly that shape, so **any signed-in user with no active Clerk org can adjust shifts at any merchant**. Every other SECURITY DEFINER function with a bare `IF NOT (is_merchant_admin(…) …)` check needs the same audit. Fix: `IF NOT COALESCE(…, false)` (as `get_timesheet_summary` does), or make the helpers return false. It is also still granted to `anon`. |
| Low | The open-shift lookup in `handle_time_clock` / `handle_time_clock_v2` (`WHERE staff_profile_id = … AND status != 'completed'`) is not scoped to a location. One staff member holds 2 open shifts live. |
| Low | `is_auto_closed` should be a column (`closed_by: 'staff' \| 'manager' \| 'system'`), not a prefix in `notes`. |

---

## 11. Build record (2026-09-16)

### What landed
| Area | Files |
|---|---|
| SQL (applied to Dev, recorded in `supabase_migrations.schema_migrations`) | `supabase/migrations/20260916120000_timesheet_summary.sql`, `rollback/20260916120000_timesheet_summary_rollback.sql` |
| Types | Two function signatures hand-added to `database.types.ts` and `app/database.types.ts`. A full `supabase gen types` would drag in unrelated drift (graphql schema, two other migrations, 231 lines in the app copy). |
| Contract + pure logic | `lib/timesheets/{types,period,summary,format,csv,download}.ts` |
| Tests | `tests/timesheets/{period,format,summary,csv}.test.ts` + `fixtures.ts`: 40 tests. They pass under the machine's own zone, `TZ=Asia/Beirut` and `TZ=Asia/Tokyo`. |
| Server | `GetTimesheetSummary` (Clerk-JWT client + Zod parse) and `LogTimesheetExport` in `app/dashboard/actions/timesheets.ts`; `useTimesheetSummary` in `hooks/useTimesheets.ts`. Adjust now also invalidates the summary. |
| UI | `app/dashboard/staff/timesheets/page.tsx` (rewritten), `components/{PeriodControls,TimesheetStats,ReviewChips,SummaryGrid,DayDetailDialog,ShiftsTable,ExportMenu}.tsx` |
| Adjust dialog | POS `{start,end}` breaks load with their times; inputs are in the location's zone; `bg-white` → theme surfaces. |
| Removed | `columns.tsx`, `ShiftDetailsDialog.tsx`, `utils/exportTimesheets.ts`. No other importers; `hooks/useTimesheets.ts` stays because `useAdjustShiftTimes` lives there. |

### Deviations from §3–§4, and why
1. **The authz check is `IF NOT COALESCE(…, false)`.** The helpers return NULL for an outsider without an `org_id` claim, so a bare `IF NOT` would let them through. See §10.
2. **The team list** resolves `location_members` rows keyed only by `user_id` (Clerk users upgraded from POS) to their staff profile, as `get_unified_staff_view` does. Without this the Owner disappears. "Active" = `lm.is_active AND sp.is_active`. The role comes from `roles.name`.
3. **The range guard** rejects `end − start > 92`, which means 93 calendar days. The client clamps to the same rule.
4. **Est. pay for a zero-hour member shows `—`, not `$0.00`.** A rate only exists on shift snapshots, so with no shifts there is nothing to price.
5. **Grid layout.** The table is `table-fixed`: name 200px, figures 96/112/112px, and the period's columns share the rest. Markers (moon, hourglass) and a week's OT sit on a second line under the number. With auto layout, one "Missing" cell pushed its neighbours and a week overflowed a 1440px screen.
6. **Error state.** Inline panel with *Try again*; no extra toast.

### Verification
- **SQL, against real Uptown data:**
  - Net minutes hand-checked on 5 shifts: an overnight shift, a POS break logged after clock-out (clamped to 0), POS-shape breaks, web-shape breaks, and a 206 h runaway.
  - Overtime = `max(week − 2400, 0)` for every person-week in three ranges, with 0 violations.
  - Speed: 31 days ≈ 6 ms; 40 staff × 42 days synthetic ≈ 11–14 ms.
  - Guards all raise as specified.
- **Browser**, as mikedoe on Uptown Branch at 1440px, with 0 console errors across both runs:
  - Week, month and custom views.
  - Day detail showing a dated clock-out.
  - Review chip → URL `review=long`.
  - Name → Shifts view filtered by `member`.
  - Adjust dialog on a POS-break shift shows *Apr 24 2:58 PM → 3:09 PM* (blank before this work). Opened and closed only; nothing saved.
  - Dark mode inside the dashboard route.
  - At 390px there is no horizontal overflow.
  - The week table fits: `scrollWidth 1086 = clientWidth 1086`.
- **CSV vs screen**, custom range Jun 15 – Sep 13:
  - The Summary CSV total row reads `4035.22 / 3529.87 / 49.75`, identical to the on-screen footer.
  - The 31 Shift detail rows add up to the same hours, OT and pay to the cent.
  - The file starts with a UTF-8 BOM, and timestamps carry their offset (`-04:00`).
- **Type check and design-system greps:**
  - Full `tsc`: no errors in any touched file apart from the pre-existing, project-wide `date-fns` TS7016. `tsconfig.json` is untouched.
  - The design-system greps (dividers, status colour, legacy tokens, `hsl(var(`, Sheet) are clean on every new UI file.

### Still open
- [ ] **Seeded QA data** on Dev (12 members with rates; overtime, overnight, >16 h, open, no-rate and DST cases). Dev has almost no rates, so pay and overtime are proven by tests and SQL, not yet by a realistic screen. It writes to the shared Dev DB, so it needs an explicit go-ahead.
- [ ] A user with **only** `location.team.view` (not a merchant admin), to prove the non-admin path.
- [ ] The DoD **screen recording**, including a cross-tenant attempt on screen, reviewed by Abubeckr or Temur.
- [ ] Production: apply the migration there (the ledger row is on Dev only) before this ships.
- [ ] §10 tickets, above all the NULL-authz bypass in `admin_adjust_staff_shift`.
