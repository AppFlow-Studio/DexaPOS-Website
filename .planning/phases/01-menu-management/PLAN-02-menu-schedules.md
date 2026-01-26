# Plan 02: Menu Schedule Management

```yaml
phase: 01-menu-management
plan: 02
type: execute
wave: 2
depends_on:
  - PLAN-01-modifier-management.md
files_modified:
  - app/manage/actions/admin-merchant/schedules.ts
  - app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx
  - app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
  - lib/queries/use-admin-merchant.ts
  - lib/queries/admin-keys.ts
autonomous: true

must_haves:
  truths:
    - "Admin can view all schedules for a merchant (global + location-specific)"
    - "Admin can create a new schedule with name, description, and time slots"
    - "Admin can assign existing schedules to a menu"
    - "Admin can remove schedule assignments from a menu"
    - "Admin can delete schedules (removes all menu assignments first)"
    - "MenusTable shows schedule count badge for each menu"
  artifacts:
    - path: "app/manage/actions/admin-merchant/schedules.ts"
      provides: "CRUD server actions for schedules"
      exports: ["getAdminSchedules", "createAdminSchedule", "updateAdminSchedule", "deleteAdminSchedule", "assignScheduleToMenu", "removeScheduleFromMenu"]
    - path: "app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx"
      provides: "UI for viewing and managing menu schedules"
      min_lines: 100
  key_links:
    - from: "MenusTable.tsx"
      to: "MenuSchedulesSheet.tsx"
      via: "state-controlled sheet open"
      pattern: "scheduleSheetOpen"
    - from: "MenuSchedulesSheet.tsx"
      to: "schedules.ts actions"
      via: "server action calls"
      pattern: "assignScheduleToMenu|removeScheduleFromMenu"
```

## Context

Menu schedules define when menus are active (e.g., "Breakfast Menu" active 6am-11am Mon-Fri). The merchant dashboard already has comprehensive schedule management at `app/dashboard/actions/schedules.ts`. This plan creates admin-context versions of these server actions and adds UI to assign/manage schedules from the MenusTable.

The implementation follows the context decision: "Admin can create, edit, delete schedules AND assign them to menus. Schedule changes apply immediately upon save."

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@app/dashboard/actions/schedules.ts
@app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create admin schedule server actions</name>
  <files>app/manage/actions/admin-merchant/schedules.ts</files>
  <action>
  Create `schedules.ts` with admin schedule operations:

  1. Add imports at top:
     ```typescript
     'use server'
     import { createServerSupabaseClient } from '@/lib/supabase/server'
     import { createServiceRoleClient } from '@/lib/supabase/service-role'
     import { assertHQPermission } from '@/lib/auth/admin-auth'
     ```

  2. Add types:
     ```typescript
     export type AdminSchedule = {
       id: string
       name: string
       description: string | null
       is_active: boolean
       merchant_id: string
       location_id: string | null
       created_at: string
       schedule_time_slots: AdminTimeSlot[]
       assigned_menus?: { id: string; name: string }[]
     }

     export type AdminTimeSlot = {
       id: string
       schedule_id: string
       day_of_week: number // 0=Sunday, 6=Saturday
       start_time: string // HH:MM format
       end_time: string // HH:MM format
       is_active: boolean
     }
     ```

  3. Add `getAdminSchedules(merchantId, locationId)`:
     - Call `assertHQPermission('hq.merchant.view')`
     - Query schedules table with location filtering
     - Include schedule_time_slots relation
     - Return `AdminSchedule[]`

  4. Add `getAdminScheduleWithMenus(merchantId, scheduleId)`:
     - Join with menu_schedules to get assigned menus
     - Return single `AdminSchedule` with assigned_menus populated

  5. Add `createAdminSchedule(merchantId, data)`:
     - data includes: name, description, is_active, location_id, time_slots[]
     - Insert schedule, then insert time_slots

  6. Add `updateAdminSchedule(merchantId, scheduleId, data)`:
     - Update schedule record
     - If time_slots provided, delete old slots, insert new ones

  7. Add `deleteAdminSchedule(merchantId, scheduleId)`:
     - Delete from menu_schedules first
     - Delete time_slots
     - Delete schedule

  8. Add `assignScheduleToMenu(merchantId, menuId, scheduleId)`:
     - Insert into menu_schedules junction table

  9. Add `removeScheduleFromMenu(merchantId, menuId, scheduleId)`:
     - Delete from menu_schedules

  10. Add `getMenuSchedules(merchantId, menuId)`:
      - Get all schedules assigned to a specific menu
  </action>
  <verify>
  test -f app/manage/actions/admin-merchant/schedules.ts
  grep -q "getAdminSchedules" app/manage/actions/admin-merchant/schedules.ts
  grep -q "assignScheduleToMenu" app/manage/actions/admin-merchant/schedules.ts
  grep -q "assertHQPermission" app/manage/actions/admin-merchant/schedules.ts
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - schedules.ts file exists with 'use server' directive
  - AdminSchedule and AdminTimeSlot types are exported
  - getAdminSchedules, createAdminSchedule, updateAdminSchedule, deleteAdminSchedule actions exist
  - assignScheduleToMenu and removeScheduleFromMenu actions exist
  - All actions use assertHQPermission
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Add schedule React Query hooks</name>
  <files>lib/queries/use-admin-merchant.ts, lib/queries/admin-keys.ts</files>
  <action>
  1. Add query keys to `lib/queries/admin-keys.ts`:
     ```typescript
     merchantSchedules: (merchantId: string, locationId: string | null) =>
       ['admin', 'merchant', merchantId, 'schedules', locationId] as const,
     merchantScheduleDetail: (merchantId: string, scheduleId: string) =>
       ['admin', 'merchant', merchantId, 'schedule', scheduleId] as const,
     merchantMenuSchedules: (merchantId: string, menuId: string) =>
       ['admin', 'merchant', merchantId, 'menu', menuId, 'schedules'] as const,
     ```

  2. Add hooks to `use-admin-merchant.ts`:
     ```typescript
     export function useAdminSchedules(merchantId: string, locationId: string | null) {
       return useQuery({
         queryKey: adminKeys.merchantSchedules(merchantId, locationId),
         queryFn: () => getAdminSchedules(merchantId, locationId),
         enabled: !!merchantId,
         staleTime: 5 * 60 * 1000,
       })
     }

     export function useAdminMenuSchedules(merchantId: string, menuId: string | null) {
       return useQuery({
         queryKey: adminKeys.merchantMenuSchedules(merchantId, menuId || ''),
         queryFn: () => menuId ? getMenuSchedules(merchantId, menuId) : [],
         enabled: !!merchantId && !!menuId,
         staleTime: 5 * 60 * 1000,
       })
     }
     ```

  3. Export new types and hooks
  </action>
  <verify>
  grep -q "merchantSchedules" lib/queries/admin-keys.ts
  grep -q "merchantMenuSchedules" lib/queries/admin-keys.ts
  grep -q "useAdminSchedules" lib/queries/use-admin-merchant.ts
  grep -q "useAdminMenuSchedules" lib/queries/use-admin-merchant.ts
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - adminKeys.merchantSchedules query key exists
  - adminKeys.merchantMenuSchedules query key exists
  - useAdminSchedules hook exists and is exported
  - useAdminMenuSchedules hook exists and is exported
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Create MenuSchedulesSheet component</name>
  <files>app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx</files>
  <action>
  Create `MenuSchedulesSheet.tsx` for viewing and managing schedules assigned to a menu:

  1. Props interface:
     ```typescript
     interface MenuSchedulesSheetProps {
       open: boolean
       onClose: () => void
       merchantId: string
       locationId: string | null
       menuId: string | null
       menuName: string
       onSuccess: () => void
     }
     ```

  2. Content sections:
     - Header: "Schedules for {menuName}"
     - List of currently assigned schedules with remove button
     - Divider
     - "Add Schedule" section with dropdown of available schedules
     - Button to create new schedule (opens inline form or nested sheet)

  3. Assigned schedule display:
     - Schedule name
     - Time slots preview (e.g., "Mon-Fri 9:00-17:00")
     - Active/inactive badge
     - Remove button

  4. Available schedules dropdown:
     - Fetch all schedules for merchant with useAdminSchedules
     - Filter out already assigned
     - On select, call assignScheduleToMenu and invalidate queries

  5. Create new schedule section (collapsed by default):
     - Name input
     - Description textarea
     - Time slot builder (day checkboxes + start/end time inputs)
     - Save button calls createAdminSchedule then assignScheduleToMenu

  6. Use existing patterns: BottomSheet components, Badge for status, Collapsible for time slot details, Toast for feedback
  </action>
  <verify>
  test -f app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx
  grep -q "MenuSchedulesSheetProps" app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx
  grep -q "useAdminSchedules" app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx
  grep -q "assignScheduleToMenu" app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - MenuSchedulesSheet.tsx file exists
  - Component accepts MenuSchedulesSheetProps
  - Shows list of assigned schedules with remove button
  - Has dropdown to assign existing schedules
  - Has form to create new schedule
  - Calls assignScheduleToMenu/removeScheduleFromMenu on actions
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 4: Update MenusTable with schedule management</name>
  <files>app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx</files>
  <action>
  1. Add state for schedule sheet:
     ```typescript
     const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false)
     const [selectedMenuForSchedules, setSelectedMenuForSchedules] = useState<{id: string; name: string} | null>(null)
     ```

  2. Add "Manage Schedules" action to menu row dropdown:
     ```tsx
     <DropdownMenuItem onClick={() => handleManageSchedules(menu)}>
       <Calendar className="h-4 w-4 mr-2" />
       Manage Schedules
     </DropdownMenuItem>
     ```

  3. In menu row display, show schedule count badge:
     ```tsx
     {menu.schedules_count > 0 && (
       <Badge variant="outline" className="text-xs">
         <Clock className="h-3 w-3 mr-1" />
         {menu.schedules_count} schedules
       </Badge>
     )}
     ```

  4. Import and render MenuSchedulesSheet at component bottom

  5. Add handler:
     ```typescript
     const handleManageSchedules = (menu: AdminMenu) => {
       setSelectedMenuForSchedules({ id: menu.id, name: menu.name })
       setScheduleSheetOpen(true)
     }
     ```

  6. Invalidate schedule queries on success

  7. Import Calendar and Clock icons from lucide-react
  </action>
  <verify>
  grep -q "scheduleSheetOpen" app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
  grep -q "MenuSchedulesSheet" app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
  grep -q "Manage Schedules" app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
  grep -q "schedules_count" app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - MenusTable has state for schedule sheet management
  - "Manage Schedules" action exists in menu row dropdown
  - Schedule count badge displays for menus with schedules
  - MenuSchedulesSheet is rendered and controlled by state
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 5: Update admin menu server actions to include schedule count</name>
  <files>app/manage/actions/admin-merchant/menus.ts</files>
  <action>
  In `app/manage/actions/admin-merchant/menus.ts`:

  1. Update `getAdminMenus` to include schedules_count:
     - Add left join or subquery to count menu_schedules
     - Add `schedules_count: number` to AdminMenu type

  2. Verify the query returns schedule count:
     ```sql
     SELECT m.*,
       (SELECT COUNT(*) FROM menu_schedules ms WHERE ms.menu_id = m.id) as schedules_count
     FROM menus m
     WHERE m.merchant_id = $1
     ```
  </action>
  <verify>
  grep -q "schedules_count" app/manage/actions/admin-merchant/menus.ts
  npm run typecheck 2>&1 | head -20
  npm run build 2>&1 | head -50
  </verify>
  <done>
  - AdminMenu type includes schedules_count: number
  - getAdminMenus query includes schedule count calculation
  - Build passes with no TypeScript errors
  </done>
</task>

</tasks>

<verification>
```bash
# Build check
cd /Users/temurbeksayfutdinov/Documents/AppFlowStudios/dexapos-website && npm run build 2>&1 | head -100

# Type check
npm run typecheck 2>&1 | head -50

# Lint check
npm run lint 2>&1 | head -50
```
</verification>

<success_criteria>
1. Admin can view all schedules for a merchant (global + location-specific)
2. Admin can create a new schedule with name, description, and time slots
3. Admin can assign existing schedules to a menu
4. Admin can remove schedule assignments from a menu
5. Admin can delete schedules (removes all menu assignments first)
6. MenusTable shows schedule count badge for each menu
7. MenusTable has "Manage Schedules" action that opens MenuSchedulesSheet
8. Build passes with no TypeScript errors
9. All operations use assertHQPermission for authorization
</success_criteria>

<output>
After completion, create `.planning/phases/01-menu-management/01-02-SUMMARY.md`
</output>
