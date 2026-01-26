# Plan 05: Admin Menu Detail Page

```yaml
phase: 01-menu-management
plan: 05
type: execute
wave: 4
depends_on: ["01-01", "01-04"]
files_modified:
  - app/manage/merchants/[merchantId]/menu/[menuId]/page.tsx
  - app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
  - app/manage/actions/admin-merchant/menus.ts
  - lib/queries/admin-keys.ts
autonomous: true

must_haves:
  truths:
    - "Admin can navigate to a specific menu detail view from MenusTable"
    - "Admin can see menu overview (category count, item count, schedule count)"
    - "Admin can view categories assigned to the menu with expand/collapse"
    - "Admin can view items within each category including effective prices"
    - "Admin can toggle category visibility in the menu"
    - "Admin can reorder categories within the menu"
    - "Admin can edit item prices in menu context"
    - "Admin can access menu settings (name, description, active status)"
  artifacts:
    - path: "app/manage/merchants/[merchantId]/menu/[menuId]/page.tsx"
      provides: "Admin menu detail page with tabs"
      min_lines: 300
    - path: "app/manage/actions/admin-merchant/menus.ts"
      provides: "Additional server actions for menu detail operations"
      exports: ["toggleAdminCategoryInMenu", "updateAdminMenuCategoryOrder"]
  key_links:
    - from: "MenusTable.tsx"
      to: "/manage/merchants/[merchantId]/menu/[menuId]"
      via: "Link or router.push"
      pattern: "menu/.*menuId"
    - from: "page.tsx"
      to: "menus.ts actions"
      via: "server action calls"
      pattern: "toggleAdminCategoryInMenu|updateAdminMenuCategoryOrder"
```

## Context

The admin portal currently shows menu details in an expandable row within MenusTable. To provide a better UX matching the merchant dashboard, we need a dedicated menu detail page at `/manage/merchants/[merchantId]/menu/[menuId]`. This page will mirror the merchant dashboard's menu detail page with tabs for Overview, Categories & Items, Schedules, and Settings.

The existing `getAdminMenuWithCategories` server action and `useAdminMenuWithCategories` hook already provide the data we need with full 5-level price cascade. We need to add additional server actions for menu-specific operations and create the page UI.

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@app/manage/actions/admin-merchant/menus.ts
@app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
@lib/queries/use-admin-merchant.ts
@lib/queries/admin-keys.ts
@app/dashboard/menu/[menuId]/page.tsx
@components/dashboard/menu/menuId/MenuOverviewTab.tsx
@components/dashboard/menu/menuId/MenuCategoriesTab.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add admin menu detail server actions</name>
  <files>app/manage/actions/admin-merchant/menus.ts</files>
  <action>
  Add server actions for menu detail operations. These are specific to toggling category visibility and reordering categories within a menu context (different from the existing category CRUD):

  1. Add `toggleAdminCategoryInMenu(merchantId, menuId, categoryId, isActive)` server action:
     - Call `assertHQPermission('hq.merchant.update')` at start
     - Update `menu_categories` table: set `is_active` field for the menu-category association
     - Return `{ success: boolean, error?: string }`

  2. Add `updateAdminMenuCategoryOrder(merchantId, menuId, categoryOrders: Array<{categoryId, displayOrder}>)` server action:
     - Call `assertHQPermission('hq.merchant.update')` at start
     - Verify menu belongs to merchant
     - Update `menu_categories.display_order` for each category
     - Return `{ success: boolean, error?: string }`

  3. Add `getAdminMenuSchedules(merchantId, menuId)` server action:
     - Call `assertHQPermission('hq.merchant.view')` at start
     - Query `menu_schedules` joined with `schedules` and `schedule_time_slots`
     - Return array of schedules with their time slots

  Export all new actions.
  </action>
  <verify>
  grep -q "toggleAdminCategoryInMenu" app/manage/actions/admin-merchant/menus.ts
  grep -q "updateAdminMenuCategoryOrder" app/manage/actions/admin-merchant/menus.ts
  grep -q "getAdminMenuSchedules" app/manage/actions/admin-merchant/menus.ts
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - toggleAdminCategoryInMenu server action exists with assertHQPermission
  - updateAdminMenuCategoryOrder server action exists for reordering
  - getAdminMenuSchedules server action exists for fetching menu schedules
  - All actions are exported
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Admin Menu Detail Page</name>
  <files>app/manage/merchants/[merchantId]/menu/[menuId]/page.tsx</files>
  <action>
  Create the admin menu detail page mirroring the merchant dashboard pattern:

  1. Create the page component with proper params extraction:
     ```typescript
     interface AdminMenuDetailPageProps {
       params: Promise<{ merchantId: string; menuId: string }>
     }
     ```

  2. Page structure with tabs:
     - Use Tabs component from shadcn/ui
     - Tabs: Overview, Categories & Items, Schedules, Settings
     - Load data using `useAdminMenuWithCategories(merchantId, menuId, locationId)`

  3. Header section:
     - Back button to `/manage/merchants/[merchantId]?tab=menu`
     - Menu name and description
     - Active/Inactive badge
     - Global/Location badge

  4. Overview tab (simplified version):
     - Card showing category count, item count, schedule count
     - Copy pattern from merchant MenuOverviewTab but adapt for admin types

  5. Categories & Items tab:
     - List categories with expand/collapse (use Collapsible component)
     - Each category shows items with 5-level effective price
     - Category visibility toggle (calls toggleAdminCategoryInMenu)
     - Category reorder buttons (up/down arrows)
     - Save order button when changes detected
     - Item edit button opens ItemFormSheet

  6. Schedules tab:
     - Display assigned schedules
     - Show time slots in a weekly view or simple list

  7. Settings tab:
     - Edit menu name and description using MenuFormSheet
     - Toggle menu active/inactive
     - Delete menu button with confirmation

  Use existing admin components and patterns:
  - ItemFormSheet for item editing
  - MenuFormSheet for menu editing
  - AlertDialog for delete confirmation
  - Same styling as merchant dashboard

  State management:
  - useState for expanded categories
  - useState for category reorder tracking
  - useState for sheet open states
  - useQueryClient for invalidation
  </action>
  <verify>
  test -f app/manage/merchants/[merchantId]/menu/[menuId]/page.tsx
  grep -q "useAdminMenuWithCategories" app/manage/merchants/[merchantId]/menu/[menuId]/page.tsx
  grep -q "Tabs" app/manage/merchants/[merchantId]/menu/[menuId]/page.tsx
  grep -q "toggleAdminCategoryInMenu" app/manage/merchants/[merchantId]/menu/[menuId]/page.tsx
  npm run typecheck 2>&1 | head -30
  </verify>
  <done>
  - Admin menu detail page exists at app/manage/merchants/[merchantId]/menu/[menuId]/page.tsx
  - Page has 4 tabs: Overview, Categories & Items, Schedules, Settings
  - Page fetches data using useAdminMenuWithCategories hook
  - Category visibility toggle works
  - Category reordering UI exists with save button
  - Item editing sheet integration works
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Add navigation link from MenusTable</name>
  <files>app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx</files>
  <action>
  Update MenusTable to add navigation to the new menu detail page:

  1. Add "View Details" dropdown menu item in MenuRow's action dropdown:
     ```tsx
     <DropdownMenuItem onClick={(e) => {
       e.stopPropagation()
       router.push(`/manage/merchants/${merchantId}/menu/${menu.id}`)
     }}>
       <Eye className="h-4 w-4 mr-2" />
       View Details
     </DropdownMenuItem>
     ```

  2. Add useRouter import from next/navigation

  3. Pass router or navigation function to MenuRow component if needed

  4. Alternative: Make the menu name/title clickable as a Link:
     ```tsx
     <Link
       href={`/manage/merchants/${merchantId}/menu/${menu.id}`}
       className="font-medium truncate hover:underline"
       onClick={(e) => e.stopPropagation()}
     >
       {menu.name}
     </Link>
     ```

  This provides two ways to navigate: clicking the name or using the dropdown menu.
  </action>
  <verify>
  grep -q "View Details" app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
  grep -q "/menu/" app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
  grep -q "useRouter\|Link" app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
  npm run typecheck 2>&1 | head -20
  npm run build 2>&1 | head -50
  </verify>
  <done>
  - MenusTable has "View Details" action in dropdown menu
  - Menu name is clickable as a Link
  - Navigation goes to /manage/merchants/[merchantId]/menu/[menuId]
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

# Verify route exists
ls -la app/manage/merchants/\[merchantId\]/menu/\[menuId\]/
```
</verification>

<success_criteria>
1. Admin can navigate to /manage/merchants/[merchantId]/menu/[menuId] from MenusTable
2. Menu detail page shows Overview tab with category/item/schedule counts
3. Categories & Items tab displays expandable categories with items and effective prices
4. Admin can toggle category visibility within the menu
5. Admin can reorder categories and save the new order
6. Admin can edit items via the ItemFormSheet
7. Schedules tab shows assigned schedules
8. Settings tab allows editing menu name/description and toggling active status
9. Build passes with no TypeScript errors
10. All operations use assertHQPermission for authorization
</success_criteria>

<output>
After completion, create `.planning/phases/01-menu-management/01-05-SUMMARY.md`
</output>
