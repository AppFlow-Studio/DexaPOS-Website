# Plan 01: Modifier Group Management

```yaml
phase: 01-menu-management
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/manage/merchants/[merchantId]/components/MenuTab/ModifiersTable.tsx
  - app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierFormSheet.tsx
  - app/manage/actions/admin-merchant/menus.ts
  - lib/queries/use-admin-merchant.ts
  - lib/queries/admin-keys.ts
autonomous: true

must_haves:
  truths:
    - "Admin can create a new modifier group with name, description, required flag, and selection limits"
    - "Admin can add modifier options (items) to a group with name, price modifier, and default flag"
    - "Admin can edit existing modifier groups and their options"
    - "Admin can delete modifier groups (with cascade delete of options)"
    - "ModifiersTable shows action buttons (edit, delete) for each group"
  artifacts:
    - path: "app/manage/actions/admin-merchant/menus.ts"
      provides: "CRUD server actions for modifier groups"
      exports: ["createAdminModifierGroup", "updateAdminModifierGroup", "deleteAdminModifierGroup", "createAdminModifierItem", "updateAdminModifierItem", "deleteAdminModifierItem"]
    - path: "app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierFormSheet.tsx"
      provides: "Form UI for creating/editing modifier groups"
      min_lines: 100
  key_links:
    - from: "ModifiersTable.tsx"
      to: "ModifierFormSheet.tsx"
      via: "state-controlled sheet open"
      pattern: "modifierSheetOpen"
    - from: "ModifierFormSheet.tsx"
      to: "menus.ts actions"
      via: "server action calls"
      pattern: "createAdminModifierGroup|updateAdminModifierGroup"
```

## Context

The ModifiersTable currently displays modifier groups in read-only mode. Admins need full CRUD capabilities to create, edit, and delete modifier groups and their options for any merchant. This plan adds the missing server actions, React Query hooks, and form UI to enable complete modifier management.

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@app/manage/actions/admin-merchant/menus.ts
@app/manage/merchants/[merchantId]/components/MenuTab/ModifiersTable.tsx
@lib/queries/use-admin-merchant.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add admin modifier group server actions</name>
  <files>app/manage/actions/admin-merchant/menus.ts</files>
  <action>
  Add CRUD server actions for modifier groups:

  1. Add `createAdminModifierGroup(merchantId, data)` server action:
     - Call `assertHQPermission('hq.merchant.update')` at start
     - Insert into `modifier_groups` table with: name, description, is_required, min_selections, max_selections, merchant_id, location_id (nullable), is_active, is_global
     - Return typed `AdminModifierGroup` with error handling

  2. Add `updateAdminModifierGroup(merchantId, groupId, data)` server action:
     - Call `assertHQPermission('hq.merchant.update')` at start
     - Update `modifier_groups` table
     - Return typed `AdminModifierGroup` with error handling

  3. Add `deleteAdminModifierGroup(merchantId, groupId)` server action:
     - Call `assertHQPermission('hq.merchant.update')` at start
     - Delete all `modifier_items` with this group_id first (cascade)
     - Delete from `modifier_groups`
     - Return `{ success: boolean, error?: string }`

  4. Add `createAdminModifierItem(merchantId, groupId, data)` server action:
     - Insert into `modifier_items` table with: name, description, price_modifier, is_default, is_active, sort_order
     - Return typed modifier item

  5. Add `updateAdminModifierItem(merchantId, itemId, data)` server action

  6. Add `deleteAdminModifierItem(merchantId, itemId)` server action

  Export all new actions and their types.
  </action>
  <verify>
  grep -q "createAdminModifierGroup" app/manage/actions/admin-merchant/menus.ts
  grep -q "updateAdminModifierGroup" app/manage/actions/admin-merchant/menus.ts
  grep -q "deleteAdminModifierGroup" app/manage/actions/admin-merchant/menus.ts
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - createAdminModifierGroup server action exists with assertHQPermission call
  - updateAdminModifierGroup server action exists
  - deleteAdminModifierGroup server action exists with cascade delete
  - createAdminModifierItem, updateAdminModifierItem, deleteAdminModifierItem actions exist
  - All actions are exported
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Add React Query hooks for modifier groups</name>
  <files>lib/queries/use-admin-merchant.ts, lib/queries/admin-keys.ts</files>
  <action>
  1. Verify/add query keys to `lib/queries/admin-keys.ts`:
     ```typescript
     merchantModifiers: (merchantId: string, locationId: string | null) =>
       ['admin', 'merchant', merchantId, 'modifiers', locationId] as const,
     merchantModifierDetail: (merchantId: string, groupId: string, locationId: string | null) =>
       ['admin', 'merchant', merchantId, 'modifier', groupId, locationId] as const,
     ```

  2. Verify hooks exist in `lib/queries/use-admin-merchant.ts` - if missing, add:
     - `useAdminModifierGroups(merchantId, locationId)` query hook
     - `useAdminModifierGroupDetails(merchantId, groupId, locationId)` query hook

  3. Export any new hooks from `use-admin-merchant.ts`
  </action>
  <verify>
  grep -q "merchantModifiers" lib/queries/admin-keys.ts
  grep -q "useAdminModifierGroups" lib/queries/use-admin-merchant.ts
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - adminKeys.merchantModifiers query key exists
  - adminKeys.merchantModifierDetail query key exists
  - useAdminModifierGroups hook exists and is exported
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Create ModifierFormSheet component</name>
  <files>app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierFormSheet.tsx</files>
  <action>
  Create `ModifierFormSheet.tsx` with:

  1. Create bottom sheet with two modes: create and edit

  2. Form fields for modifier group:
     - name (required, string)
     - description (optional, textarea)
     - is_required (boolean switch)
     - min_selections (number input, default 0)
     - max_selections (number input, nullable for unlimited)
     - is_active (boolean switch)
     - location_id (hidden - use current location context from props)

  3. Section for modifier options (items):
     - List existing items with edit/delete buttons
     - "Add Option" button to add inline item form
     - Item fields: name, price_modifier (number), is_default (boolean), is_active (boolean)
     - Use collapsible section or accordion for options list

  4. Form submission:
     - On create: call `createAdminModifierGroup`, then `createAdminModifierItem` for each option
     - On edit: call `updateAdminModifierGroup`, handle option CRUD
     - Invalidate `adminKeys.merchantModifiers` on success
     - Show toast feedback

  5. Use existing patterns from ItemFormSheet:
     - BottomSheet components
     - React Hook Form + Zod validation
     - Loading states with Loader2 icon
     - useEffect to reset form when open/item changes
  </action>
  <verify>
  test -f app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierFormSheet.tsx
  grep -q "createAdminModifierGroup" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierFormSheet.tsx
  grep -q "useForm" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierFormSheet.tsx
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - ModifierFormSheet.tsx file exists
  - Component accepts props for create/edit mode
  - Form includes all modifier group fields
  - Form includes modifier options section
  - Calls createAdminModifierGroup/updateAdminModifierGroup on submit
  - Shows toast feedback on success/error
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 4: Update ModifiersTable with CRUD UI</name>
  <files>app/manage/merchants/[merchantId]/components/MenuTab/ModifiersTable.tsx</files>
  <action>
  1. Add state management for sheet:
     ```typescript
     const [modifierSheetOpen, setModifierSheetOpen] = useState(false)
     const [modifierSheetMode, setModifierSheetMode] = useState<'create' | 'edit'>('create')
     const [editingGroup, setEditingGroup] = useState<AdminModifierGroup | null>(null)
     const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<AdminModifierGroup | null>(null)
     const [isDeleting, setIsDeleting] = useState(false)
     ```

  2. Add "Add Modifier Group" button in header next to Refresh button:
     ```tsx
     <Button size="sm" onClick={handleCreateModifier}>
       <Plus className="h-4 w-4 mr-2" />
       Add Modifier Group
     </Button>
     ```

  3. Add action dropdown to each ModifierGroupRow:
     - Edit Modifier Group
     - Delete Modifier Group (with confirmation dialog)

  4. Import and render ModifierFormSheet at bottom of component

  5. Import and add AlertDialog for delete confirmation (copy pattern from CategoriesTable)

  6. Add handler functions: handleCreateModifier, handleEditModifier, handleDeleteModifier

  7. Add query invalidation helper using useQueryClient
  </action>
  <verify>
  grep -q "modifierSheetOpen" app/manage/merchants/[merchantId]/components/MenuTab/ModifiersTable.tsx
  grep -q "ModifierFormSheet" app/manage/merchants/[merchantId]/components/MenuTab/ModifiersTable.tsx
  grep -q "Add Modifier Group" app/manage/merchants/[merchantId]/components/MenuTab/ModifiersTable.tsx
  npm run typecheck 2>&1 | head -20
  npm run build 2>&1 | head -50
  </verify>
  <done>
  - ModifiersTable has state for sheet management
  - "Add Modifier Group" button renders in header
  - Each modifier group row has Edit and Delete actions
  - ModifierFormSheet is rendered and controlled by state
  - Delete confirmation dialog exists
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
1. Admin can create a new modifier group with name, description, required flag, and selection limits
2. Admin can add modifier options (items) to a group with name, price modifier, and default flag
3. Admin can edit existing modifier groups and their options
4. Admin can delete modifier groups (with cascade delete of options)
5. ModifiersTable shows action buttons (edit, delete) for each group
6. Build passes with no TypeScript errors
7. All operations use assertHQPermission for authorization
</success_criteria>

<output>
After completion, create `.planning/phases/01-menu-management/01-01-SUMMARY.md`
</output>
