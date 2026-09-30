# Staff Scheduling — UX Redesign (Work in progress)

> **Status: WIP — design proposal only. No code has changed.**
> Scope: `/dashboard/schedules`, the **Staff shifts** and **Reports** tabs. Menu schedules
> (`MenuSchedulesView`) are out of scope because that page is being removed.
>
> **Design canvas (Claude Design, private until shared):**
> https://claude.ai/artifact/JbiC4N1NZgARsuFnoZnMNY — 9 linked artboards; Play mode walks the flow.

---

## 0. Why this exists

Publishing one week of shifts takes 9 steps across 4 screens today. Several controls in that path
look functional but do nothing. This proposal cuts publishing to 4 steps on one screen, and shows
the effect of every decision before it's made.

**Before any UI work starts, read §2.** Staff scheduling has no server-side storage, so the redesign
depends on backend work first.

---

## 1. Current state (audited 2026-09-26)

### 1.1 Flow today

1. The **Staff shifts** tab opens on two lists: "Schedule periods" and "Weekly schedules"
   (`components/scheduling/dashboard/Dashboard.tsx`).
2. The manager chooses **New Schedule** (a modal: pick a Sunday and 1–4 weeks) or **New Period**
   (a 3-step wizard with 3 fields) (`components/scheduling/dashboard/Wizards.tsx`).
3. The editor opens on a separate page (`app/dashboard/schedules/[scheduleId]` → `ScheduleManager.tsx`).
4. Shifts are added by hovering an empty cell, which opens a modal (`ShiftModal.tsx`). Each day
   allows only one shift, and overnight shifts are rejected.
5. Applying a template: **Library** → **Set Active Templates** → pick up to 3 → **Save Selection** →
   back to the editor → pick it in the drawer → choose a mode → **Apply**.
6. The **Open shifts & requests** dialog handles drops, swaps and PTO (`OpenShiftsSheet.tsx`).
7. **Publish** opens a modal with change counts and notify checkboxes (`PublishModal.tsx`).
8. After publishing, the manager lands back on the list. Opening a published schedule silently
   clones it into a `draft-edit` copy (`useScheduleStore.ts` `findOrCreateDraft`).

### 1.2 Things that don't work (confirmed in code)

| Area | Problem | Where |
|---|---|---|
| Persistence | All staff-schedule data lives in zustand + localStorage (`schedule-storage`). It isn't shared between devices or managers, and staff never see it | `stores/useScheduleStore.ts:937-940` |
| Server actions | Everything named "schedule" in `app/dashboard/actions/schedules.ts` is for menu hours, not staff shifts | — |
| Publish | The notify checkboxes aren't wired, but the toast still says "employees notified" | `PublishModal.tsx:116-119, 162-165` |
| Filters | The `filters` state is never passed to the calendar | `ScheduleManager.tsx:83-91` vs `:437-450` |
| Open shifts | "Add Open Shift" does nothing; "Assign Employee" assigns the first staff member in the list | `ScheduleManager.tsx:480-482`, `OpenShiftsSheet.tsx:417-431` |
| Requests | Approving a drop or swap changes only the request's status, never a shift. Swap cards show mock shifts | `OpenShiftsSheet.tsx:588-606` |
| PTO | The seeded mock request shows "Unknown". Approved PTO doesn't block scheduling | `useScheduleStore.ts:150-160`, `lib/scheduling-rules.ts:39` (TODO) |
| Labor cost | A flat $18.50/h everywhere; breaks aren't deducted; the editor pill sums the whole schedule, not the visible week | `ScheduleManager.tsx:329`, `ScheduleReports.tsx:35` |
| Compliance | Every value is hardcoded to 0, so every row reads "Compliant" | `ScheduleReports.tsx:123-129` |
| Reports chart | Only the first 7 days are shown; the Y axis formats as `$Xk`, so typical days read "$0k" | `ScheduleReports.tsx:107`, `VarianceChart.tsx:39` |
| Dates | Editing a schedule's dates doesn't move its shifts | `Dashboard.tsx:173-187` |
| Week start | Creation starts weeks on Sunday; the template grid and `getShiftsForWeek` start on Monday | several |
| Confirmations | Deleting a schedule, period or open shift has no confirm step; the period wizard validates with `alert()` | `Dashboard.tsx:306,338`, `Wizards.tsx:218` |
| Dead code | `LaborMeter`, `SwapProposalWizard`, `OvertimeSummary`, `ApplyTemplateDialog`, `SaveTemplateDialog` and `TemplateManager` are never mounted | — |

The full audit is in the design session transcript. The table above covers what matters for the redesign.

---

## 2. Prerequisites (backend) — blocking

The redesign is honest only if these exist. Without them it would repeat today's problem of UI
that looks functional and isn't.

- [ ] **Shifts table** in Supabase: location-scoped, `updated_at` + trigger (offline-sync rule),
      RLS via `is_location_member` / `user_has_location_permission`. Fields: employee (nullable =
      open), start/end timestamptz (overnight allowed), role (linked to staff roles, not a
      hardcoded enum), break minutes, notes, published flag / published version.
- [ ] **Week publish state**: a per-location, per-week record (`not_started | draft | published`)
      plus a last-published snapshot, so "N changes since last publish" can be computed. This
      replaces the `draft-edit` clone model.
- [ ] **Requests table** (time off, swap, drop) with real shift references; approval mutates shifts
      inside one transaction.
- [ ] **Templates** stored server-side (currently `useScheduleTemplateStore`, also localStorage).
- [ ] **Notifications** to staff on publish, via SMS (Telnyx) and email (Resend). Decide the channels.
- [ ] **Labor inputs** for reports: pay rates from staff profiles, worked hours from POS clock
      punches (timesheets), net sales from orders.
- [ ] **Audit logging** (`LogAuditEvent`) on every shift, publish and request action.
- [ ] **POS tablet contract**: how employees see their published shifts and claim open shifts
      (separate repo, needs agreement with the tablet team).

---

## 3. Proposal

### 3.1 Principles

1. **The calendar is the schedule.** No schedule "documents", no weekly-vs-period split, no hidden
   draft copies.
2. **Shape, not colour.** Dashed = not published, hatched = time off, and the word carries the
   state. This follows DS-CTL-09 in `docs/UI-DESIGN-SYSTEM.md`.
3. **Impact before decision.** Hours, cost, overtime, who's free and who gets notified are shown
   before the click.
4. **Honest numbers.** Real pay rates, clock punches and POS sales.
5. **Fewer places to go.** Templates live inside "Fill week", requests sit next to the grid, and
   reports use a date range.

### 3.2 New flow

1. **Open Staff shifts → week grid.** The page lands on the week being planned, for the location in
   the header. ‹ › moves between weeks.
2. **Fill the week.** Copy last week or a template in one dialog, or type "9-5" into any cell.
3. **Sort out what's flagged.** One banner lists requests, overtime and open shifts, and each
   request shows its effect on the schedule.
4. **Review & publish.** Changes are grouped by person, warnings can be fixed inline, and only the
   people whose shifts changed are notified.

**A week has three states:** Not started → Draft · N changes → Published (→ Published · N changes
after further edits).

### 3.3 Screens (canvas artboards)

| # | Artboard | What it shows |
|---|---|---|
| 00 | Flow | The 9-step flow today next to the proposed 4 steps, plus the principles |
| 01 | Week grid (draft) | Rows grouped by role; an always-visible Open shifts row; each person's hours against target; each day's hours, cost and labor % of projected sales; a needs-attention banner; several shifts per day; typing a time into a cell; a legend |
| 02 | Empty week | Start options: Copy last week (recommended), Use a template, Start blank; known time off shown |
| 03 | Add / edit shift | Who (suggests available people or leave open), date, start/end, quick picks, overnight allowed, role taken from the staff profile, break, extra days, note, live cost and the person's weekly hours |
| 04 | Requests | Tabs: All / Time off / Swaps / Drops. Each request states what happens if approved (e.g. the shift becomes open and is offered to free cashiers). Decisions notify the person right away; shift changes land in the draft |
| 05 | Fill week | Source (a previous week or a template), target weeks (several at once), keep people vs copy as open shifts, keep vs replace existing shifts, per-week preview |
| 06 | Publish review | A warnings banner (overtime, conflicts with requests), changes by person, who gets notified (changed people only, everyone, or no one), post open shifts for claiming |
| 07 | Reports | Date-range presets + compare period + role filter + payroll export. KPIs: labor cost, labor % of sales, hours worked, overtime, attendance exceptions. A "Worth a look" list, a scheduled-vs-worked by day chart, hours by role, and a per-person table (can also be viewed by day or by role) |
| 08 | Mobile | Week strip, day list, sticky Add shift + Publish |

### 3.4 Design-system notes

- Follows `docs/UI-DESIGN-SYSTEM.md`: `PageShell`/`PageHeader`, tier-1/2 radii, muted borderless
  inputs, no dividing lines, pill tabs, and centred dialogs (DS-CTL-11). Mobile dialogs go
  full-screen (DS-RESP-01).
- Urgency uses a **tinted banner**, the escape hatch sanctioned by DS-CTL-09, never coloured badges.
- Chart series use the brand blue (functional encoding is allowed).

---

## 4. Open decisions

- [ ] **Role colours on shift blocks.** Deputy and 7shifts do this. Is it allowed as "functional
      encoding" under DS-CTL-09, or should blocks stay neutral as drawn?
- [ ] **Quick-add as an anchored popover vs a centred dialog.** The canvas uses a centred dialog
      (DS-CTL-11) plus type-in cells for speed. A popover would be faster but needs a DS exception.
- [ ] **Week start day.** Monday as drawn, or a per-location setting?
- [ ] **Notification channels.** SMS, email, and/or the POS tablet?
- [ ] **Multi-location view.** What does "All locations" show on the grid: a location picker
      prompt, or rows grouped by location?
- [ ] **Keep a Templates library page,** or only "Fill week" plus "Save week as template"?
- [ ] **Projected sales.** Which method (average of the last 4 same weekdays, as drawn)? Is it
      shown to every role or only to managers?

---

## 5. Work items (when picked up)

- [ ] Resolve the §4 decisions with product
- [ ] §2 backend: migrations + RLS + server actions + audit logging
- [ ] Week grid (replaces `Dashboard.tsx` list + `ScheduleManager` page; remove the `[scheduleId]` route)
- [ ] Type-in cell entry + Add/Edit shift dialog (replaces `ShiftModal`)
- [ ] Fill week dialog (replaces TemplateDrawer / ApplyTemplateBar / ConflictResolutionModal flow)
- [ ] Requests dialog with the effect of approving (replaces `OpenShiftsSheet`)
- [ ] Publish review with real notifications (replaces `PublishModal`)
- [ ] Reports rebuild on real labor data (replaces `ScheduleReports`)
- [ ] Mobile day view
- [ ] Delete dead components listed in §1.2
- [ ] Migrate or discard existing localStorage schedules (decide: one-time import vs clean start)
- [ ] Browser QA in both themes + mobile; update this doc with results

---

## 6. References

- Mobbin patterns reviewed: Deputy (week-by-area grid, inline shift popover, publish/notify
  steps), 7shifts (conflict/overtime chips, budget bar), Square (add shift, labor vs sales),
  Fresha (scheduled shifts, time-off blocks).
- `docs/UI-DESIGN-SYSTEM.md` — DS-CTL-09, DS-CTL-11, DS-RESP-01.
- Related: [PLAN-2026-09-15-TIMESHEETS-SUMMARY-GRID.md](PLAN-2026-09-15-TIMESHEETS-SUMMARY-GRID.md)
  (source of worked hours for Reports).
