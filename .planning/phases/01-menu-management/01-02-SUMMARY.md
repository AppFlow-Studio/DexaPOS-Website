---
phase: 01-menu-management
plan: 02
subsystem: menu
tags: [schedules, admin, react-query, bottom-sheet, supabase]

# Dependency graph
requires:
  - phase: 01-01
    provides: Admin modifier group management foundation

provides:
  - Admin schedule CRUD server actions with assertHQPermission
  - React Query hooks for schedules (useAdminSchedules, useAdminMenuSchedules)
  - MenuSchedulesSheet component for managing menu schedule assignments
  - Schedule count display in MenusTable
  - Time slot builder UI for creating schedules

affects: [01-03, 01-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BottomSheet pattern for schedule management UI"
    - "Admin schedule server actions with HQ permission checks"
    - "Time slot builder with day checkboxes and time inputs"

key-files:
  created:
    - app/manage/actions/admin-merchant/schedules.ts
    - app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx
  modified:
    - lib/queries/admin-keys.ts
    - lib/queries/use-admin-merchant.ts
    - app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
    - app/manage/actions/admin-merchant/menus.ts

key-decisions:
  - "Used existing merchant dashboard schedule patterns as reference"
  - "Implemented inline schedule creation within MenuSchedulesSheet for convenience"
  - "Added schedule count to menu stats for visibility"

patterns-established:
  - "Schedule assignment pattern: assign existing or create new inline"
  - "Time slot format: HH:MM for start/end times, day_of_week 0-6 (Sunday-Saturday)"

# Metrics
duration: 8 min
completed: 2026-01-25
---

# Phase 01 Plan 02: Menu Schedule Management Summary

**Admin schedule CRUD with assignment UI - HQ can manage when menus are active via time slots**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-25T17:37:22Z
- **Completed:** 2026-01-25T17:45:31Z
- **Tasks:** 5
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- Created comprehensive admin schedule server actions with location filtering
- Built MenuSchedulesSheet with assigned schedule list, dropdown to assign existing, and inline creation form
- Added schedule count badge and "Manage Schedules" action to MenusTable
- Implemented React Query hooks for schedule data fetching and caching
- Enabled time slot builder UI with day selection and time inputs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create admin schedule server actions** - `b33b1f8` (feat)
   - Created schedules.ts with getAdminSchedules, createAdminSchedule, updateAdminSchedule, deleteAdminSchedule
   - Added assignScheduleToMenu, removeScheduleFromMenu, getMenuSchedules
   - All actions use assertHQPermission for HQ authorization
   - Implemented location filtering (global + location-specific)

2. **Task 2: Add schedule React Query hooks** - `5691e75` (feat)
   - Added merchantSchedules, merchantScheduleDetail, merchantMenuSchedules query keys
   - Created useAdminSchedules and useAdminMenuSchedules hooks
   - Exported AdminSchedule type for convenience

3. **Task 3: Create MenuSchedulesSheet component** - `2d3c28a` (feat)
   - Built bottom sheet with assigned schedules list
   - Added dropdown to assign existing schedules
   - Implemented collapsible form for creating new schedules
   - Added formatTimeSlots helper to display time ranges
   - Integrated assignScheduleToMenu and removeScheduleFromMenu actions

4. **Task 4: Update MenusTable with schedule management** - `b835543` (feat)
   - Added schedule sheet state management
   - Imported Calendar and Clock icons
   - Added "Manage Schedules" dropdown action
   - Displayed schedule count badge in menu stats
   - Implemented invalidateSchedules helper for cache updates

5. **Task 5: Update admin menu server actions to include schedule count** - `03e6ead` (feat)
   - Added schedules_count field to AdminMenu type
   - Updated getAdminMenus query with menu_schedules(count) join
   - Calculated schedule count in menu mapping

**Plan metadata:** (will be committed with this summary)

## Files Created/Modified

### Created
- `app/manage/actions/admin-merchant/schedules.ts` - Admin schedule CRUD server actions
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx` - Schedule assignment UI

### Modified
- `lib/queries/admin-keys.ts` - Added schedule query keys
- `lib/queries/use-admin-merchant.ts` - Added schedule hooks and type exports
- `app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx` - Added schedule management UI
- `app/manage/actions/admin-merchant/menus.ts` - Added schedules_count to AdminMenu

## Decisions Made

1. **Referenced existing schedule implementation**: Used `app/dashboard/actions/schedules.ts` as reference to maintain consistency with merchant dashboard patterns

2. **Inline schedule creation**: Included a collapsible form within MenuSchedulesSheet to create schedules without leaving the context, improving UX

3. **Schedule count visibility**: Added schedule count badge to menu stats row for immediate visibility of schedule assignments

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Schedule management is complete for menus
- Ready to add audit information display (PLAN-03) and modifier group assignment (PLAN-04)
- Schedule foundation is in place for category and item schedules if needed in future phases

---
*Phase: 01-menu-management*
*Completed: 2026-01-25*
