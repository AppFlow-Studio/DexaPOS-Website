# Plan 03: Audit Information Display

```yaml
phase: 01-menu-management
plan: 03
type: execute
wave: 3
depends_on:
  - PLAN-01-modifier-management.md
  - PLAN-02-menu-schedules.md
files_modified:
  - app/manage/actions/admin-merchant/menus.ts
  - app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx
  - app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryDetailSheet.tsx
  - app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuDetailSheet.tsx
  - app/manage/merchants/[merchantId]/components/MenuTab/CategoriesTable.tsx
  - app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
autonomous: true

must_haves:
  truths:
    - "ItemDetailSheet displays last modified timestamp with relative time"
    - "ItemDetailSheet displays modified by user with name and email"
    - "ItemDetailSheet has editable admin notes field with save functionality"
    - "CategoryDetailSheet and MenuDetailSheet show same audit information pattern"
    - "CategoriesTable and MenusTable have View Details actions"
  artifacts:
    - path: "app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryDetailSheet.tsx"
      provides: "Detail sheet for categories with audit info"
      min_lines: 80
    - path: "app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuDetailSheet.tsx"
      provides: "Detail sheet for menus with audit info"
      min_lines: 80
  key_links:
    - from: "CategoriesTable.tsx"
      to: "CategoryDetailSheet.tsx"
      via: "state-controlled sheet open"
      pattern: "detailSheetOpen"
    - from: "MenusTable.tsx"
      to: "MenuDetailSheet.tsx"
      via: "state-controlled sheet open"
      pattern: "detailSheetOpen"
```

## Context

Per the context document: "Add audit info for admins - Show who last edited the item, when, and provide space for admin notes."

This is the key differentiator between merchant dashboard and admin dashboard. Admins need to see:
- Who last edited an entity (user name/email)
- When it was last edited (timestamp)
- Optional admin notes field

The database already has `updated_at` timestamps and likely audit_logs tracking changes. This plan surfaces that information in the admin UI.

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@app/manage/actions/admin-merchant/menus.ts
@app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend admin types and server actions for audit information</name>
  <files>app/manage/actions/admin-merchant/menus.ts</files>
  <action>
  1. Add audit fields to AdminMenuItem type:
     ```typescript
     export type AdminMenuItem = {
       // ... existing fields
       created_at: string
       updated_at: string
       created_by?: { id: string; name: string; email: string } | null
       updated_by?: { id: string; name: string; email: string } | null
       admin_notes?: string | null
     }
     ```

  2. Add similar audit fields to AdminCategory and AdminMenu types

  3. Update `getAdminMenuItemDetails` to fetch audit info:
     - Query the `audit_logs` table to get the last editor:
       ```sql
       SELECT al.created_at, al.actor_id, al.actor_name, al.actor_email
       FROM audit_logs al
       WHERE al.resource_type = 'menu_item'
         AND al.resource_id = $item_id
       ORDER BY al.created_at DESC
       LIMIT 1
       ```
     - Or check if menu_items has `updated_by` column directly

  4. Add `updateAdminNotes(merchantId, resourceType, resourceId, notes)` server action:
     - Update admin_notes field on the entity
     - This allows admins to add internal notes about items
  </action>
  <verify>
  grep -q "admin_notes" app/manage/actions/admin-merchant/menus.ts
  grep -q "updated_by" app/manage/actions/admin-merchant/menus.ts
  grep -q "updateAdminNotes" app/manage/actions/admin-merchant/menus.ts
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - AdminMenuItem type includes created_at, updated_at, created_by, updated_by, admin_notes fields
  - AdminCategory and AdminMenu types include same audit fields
  - updateAdminNotes server action exists
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Create helper function to fetch audit info</name>
  <files>app/manage/actions/admin-merchant/menus.ts</files>
  <action>
  Add helper function to fetch last edit information:

  ```typescript
  async function getLastEditInfo(
    supabase: SupabaseClient,
    resourceType: 'menu_item' | 'category' | 'menu' | 'modifier_group',
    resourceId: string
  ): Promise<{
    updated_by: { id: string; name: string; email: string } | null
    updated_at: string | null
  }> {
    // Try audit_logs table first
    const { data } = await supabase
      .from('audit_logs')
      .select('created_at, actor_id, actor_name, actor_email')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      return {
        updated_by: {
          id: data.actor_id || '',
          name: data.actor_name || 'Unknown',
          email: data.actor_email || '',
        },
        updated_at: data.created_at,
      }
    }

    return { updated_by: null, updated_at: null }
  }
  ```

  Update existing detail fetch functions to use this helper.
  </action>
  <verify>
  grep -q "getLastEditInfo" app/manage/actions/admin-merchant/menus.ts
  grep -q "audit_logs" app/manage/actions/admin-merchant/menus.ts
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - getLastEditInfo helper function exists
  - Function queries audit_logs table
  - Function returns updated_by and updated_at
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Update ItemDetailSheet to display audit information</name>
  <files>app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx</files>
  <action>
  1. Add new section after existing content:
     ```tsx
     <BottomSheetSection title="Audit Information">
       <div className="space-y-3 text-sm">
         {/* Last Modified */}
         <div className="flex justify-between items-center">
           <span className="text-muted-foreground">Last Modified</span>
           <span className="font-medium">
             {item.updated_at
               ? formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })
               : 'Never'}
           </span>
         </div>

         {/* Modified By */}
         {item.updated_by && (
           <div className="flex justify-between items-center">
             <span className="text-muted-foreground">Modified By</span>
             <div className="text-right">
               <p className="font-medium">{item.updated_by.name}</p>
               <p className="text-xs text-muted-foreground">{item.updated_by.email}</p>
             </div>
           </div>
         )}

         {/* Created */}
         <div className="flex justify-between items-center">
           <span className="text-muted-foreground">Created</span>
           <span>{item.created_at ? format(new Date(item.created_at), 'MMM d, yyyy') : 'Unknown'}</span>
         </div>

         <Separator />

         {/* Admin Notes */}
         <div className="space-y-2">
           <Label htmlFor="admin-notes">Admin Notes</Label>
           <Textarea
             id="admin-notes"
             placeholder="Internal notes (only visible to admins)..."
             value={adminNotes}
             onChange={(e) => setAdminNotes(e.target.value)}
             rows={3}
           />
           {hasNotesChanged && (
             <Button size="sm" onClick={handleSaveNotes} disabled={isSavingNotes}>
               {isSavingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Notes'}
             </Button>
           )}
         </div>
       </div>
     </BottomSheetSection>
     ```

  2. Add state and handlers:
     ```typescript
     const [adminNotes, setAdminNotes] = useState(item?.admin_notes || '')
     const [originalNotes, setOriginalNotes] = useState(item?.admin_notes || '')
     const [isSavingNotes, setIsSavingNotes] = useState(false)

     const hasNotesChanged = adminNotes !== originalNotes

     const handleSaveNotes = async () => {
       setIsSavingNotes(true)
       try {
         await updateAdminNotes(merchantId, 'menu_item', item.id, adminNotes)
         setOriginalNotes(adminNotes)
         toast.success('Notes saved')
       } catch {
         toast.error('Failed to save notes')
       } finally {
         setIsSavingNotes(false)
       }
     }
     ```

  3. Import date-fns functions:
     ```typescript
     import { formatDistanceToNow, format } from 'date-fns'
     ```
  </action>
  <verify>
  grep -q "Audit Information" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx
  grep -q "formatDistanceToNow" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx
  grep -q "adminNotes" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx
  grep -q "handleSaveNotes" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - ItemDetailSheet has "Audit Information" section
  - Shows Last Modified with relative time
  - Shows Modified By with name and email
  - Shows Created date
  - Has Admin Notes textarea with save functionality
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 4: Create CategoryDetailSheet with audit information</name>
  <files>app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryDetailSheet.tsx</files>
  <action>
  Create new file `CategoryDetailSheet.tsx`:

  1. Props interface:
     ```typescript
     interface CategoryDetailSheetProps {
       open: boolean
       onClose: () => void
       merchantId: string
       locationId: string | null
       categoryId: string | null
       onEdit: (category: AdminCategory) => void
       onSuccess: () => void
     }
     ```

  2. Similar structure to ItemDetailSheet

  3. Display category details: name, description, image, status, items count

  4. Display audit section with same pattern as ItemDetailSheet:
     - Last Modified (relative time)
     - Modified By (name + email)
     - Created date
     - Admin Notes textarea with save

  5. Include Edit button that opens CategoryFormSheet in edit mode
  </action>
  <verify>
  test -f app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryDetailSheet.tsx
  grep -q "CategoryDetailSheetProps" app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryDetailSheet.tsx
  grep -q "Audit Information" app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryDetailSheet.tsx
  grep -q "adminNotes" app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryDetailSheet.tsx
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - CategoryDetailSheet.tsx file exists
  - Component accepts CategoryDetailSheetProps
  - Shows category details (name, description, status, items count)
  - Has Audit Information section with same pattern as ItemDetailSheet
  - Has Admin Notes with save functionality
  - Has Edit button
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 5: Create MenuDetailSheet with audit information</name>
  <files>app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuDetailSheet.tsx</files>
  <action>
  Create new file `MenuDetailSheet.tsx`:

  1. Props interface:
     ```typescript
     interface MenuDetailSheetProps {
       open: boolean
       onClose: () => void
       merchantId: string
       locationId: string | null
       menuId: string | null
       onEdit: (menu: AdminMenuWithCategories) => void
       onSuccess: () => void
     }
     ```

  2. Display menu details: name, description, status, categories count, schedules count

  3. Display assigned categories list

  4. Display assigned schedules list

  5. Display audit section with same pattern as ItemDetailSheet

  6. Add admin notes functionality

  7. Include Edit button that opens MenuFormSheet in edit mode
  </action>
  <verify>
  test -f app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuDetailSheet.tsx
  grep -q "MenuDetailSheetProps" app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuDetailSheet.tsx
  grep -q "Audit Information" app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuDetailSheet.tsx
  grep -q "adminNotes" app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuDetailSheet.tsx
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - MenuDetailSheet.tsx file exists
  - Component accepts MenuDetailSheetProps
  - Shows menu details (name, description, status, categories count, schedules count)
  - Shows assigned categories list
  - Shows assigned schedules list
  - Has Audit Information section
  - Has Admin Notes with save functionality
  - Has Edit button
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 6: Update CategoriesTable and MenusTable to use detail sheets</name>
  <files>app/manage/merchants/[merchantId]/components/MenuTab/CategoriesTable.tsx, app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx</files>
  <action>
  1. In CategoriesTable:
     - Add state for detail sheet:
       ```typescript
       const [detailSheetOpen, setDetailSheetOpen] = useState(false)
       const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
       ```
     - Add "View Details" action to category row dropdown
     - Import and render CategoryDetailSheet at bottom of component

  2. In MenusTable:
     - Add state for detail sheet:
       ```typescript
       const [detailSheetOpen, setDetailSheetOpen] = useState(false)
       const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null)
       ```
     - Add "View Details" action to menu row dropdown (or make row clickable)
     - Import and render MenuDetailSheet at bottom of component
  </action>
  <verify>
  grep -q "detailSheetOpen" app/manage/merchants/[merchantId]/components/MenuTab/CategoriesTable.tsx
  grep -q "CategoryDetailSheet" app/manage/merchants/[merchantId]/components/MenuTab/CategoriesTable.tsx
  grep -q "View Details" app/manage/merchants/[merchantId]/components/MenuTab/CategoriesTable.tsx
  grep -q "detailSheetOpen" app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
  grep -q "MenuDetailSheet" app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
  grep -q "View Details" app/manage/merchants/[merchantId]/components/MenuTab/MenusTable.tsx
  npm run typecheck 2>&1 | head -20
  npm run build 2>&1 | head -50
  </verify>
  <done>
  - CategoriesTable has state for detail sheet
  - CategoriesTable has "View Details" action in dropdown
  - CategoriesTable renders CategoryDetailSheet
  - MenusTable has state for detail sheet
  - MenusTable has "View Details" action in dropdown
  - MenusTable renders MenuDetailSheet
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
1. ItemDetailSheet displays "Last Modified" timestamp with relative time (e.g., "2 hours ago")
2. ItemDetailSheet displays "Modified By" with user name and email when available
3. ItemDetailSheet displays "Created" date
4. ItemDetailSheet has editable "Admin Notes" field with save functionality
5. CategoryDetailSheet exists and shows same audit information pattern
6. MenuDetailSheet exists and shows same audit information pattern
7. CategoriesTable has "View Details" action that opens CategoryDetailSheet
8. MenusTable has "View Details" action that opens MenuDetailSheet
9. Build passes with no TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/phases/01-menu-management/01-03-SUMMARY.md`
</output>
