# Plan 04: Modifier Group Assignment to Items

```yaml
phase: 01-menu-management
plan: 04
type: execute
wave: 3
depends_on:
  - PLAN-01-modifier-management.md
files_modified:
  - app/manage/actions/admin-merchant/menus.ts
  - app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx
  - app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx
  - app/manage/merchants/[merchantId]/components/MenuTab/ItemsTable.tsx
  - lib/queries/use-admin-merchant.ts
  - lib/queries/admin-keys.ts
autonomous: true

must_haves:
  truths:
    - "Admin can view which modifier groups are assigned to an item"
    - "Admin can assign an existing modifier group to an item"
    - "Admin can remove a modifier group from an item"
    - "ItemsTable displays modifier group count badge for items that have modifiers"
  artifacts:
    - path: "app/manage/actions/admin-merchant/menus.ts"
      provides: "Server actions for item-modifier group assignment"
      exports: ["getItemModifierGroups", "assignModifierGroupToItem", "removeModifierGroupFromItem"]
  key_links:
    - from: "ItemFormSheet.tsx"
      to: "menus.ts actions"
      via: "server action calls"
      pattern: "assignModifierGroupToItem|removeModifierGroupFromItem"
    - from: "ItemDetailSheet.tsx"
      to: "useAdminItemModifierGroups hook"
      via: "data fetching"
      pattern: "useAdminItemModifierGroups"
```

## Context

Menu items can have modifier groups attached (e.g., "Size" modifier for drinks, "Toppings" for pizza). The research noted this as an open question: "Create modifier groups inline when editing item, or only assign existing groups?"

Per the context decision, we implement assignment-only in Phase 1: admins select from existing modifier groups to attach to items. This matches the merchant dashboard pattern and keeps the UI simple.

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-menu-management/01-01-SUMMARY.md
@app/manage/actions/admin-merchant/menus.ts
@app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx
@app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add server actions for item-modifier group assignment</name>
  <files>app/manage/actions/admin-merchant/menus.ts</files>
  <action>
  1. Add `getItemModifierGroups(merchantId, itemId)`:
     - Call `assertHQPermission('hq.merchant.view')`
     - Query `item_modifier_groups` junction table
     - Return modifier groups attached to this item with their options

  2. Add `assignModifierGroupToItem(merchantId, itemId, modifierGroupId, sortOrder?)`:
     - Call `assertHQPermission('hq.merchant.update')`
     - Insert into `item_modifier_groups` junction table
     - Handle duplicate gracefully (if already assigned, return success)

  3. Add `removeModifierGroupFromItem(merchantId, itemId, modifierGroupId)`:
     - Call `assertHQPermission('hq.merchant.update')`
     - Delete from `item_modifier_groups` junction table

  4. Add `updateItemModifierGroupOrder(merchantId, itemId, modifierGroupIds: string[])`:
     - Update sort_order for modifier groups on an item
     - Allows reordering which modifier appears first

  5. Update AdminMenuItem type to include:
     ```typescript
     modifier_groups?: {
       id: string
       name: string
       is_required: boolean
       items_count: number
       sort_order: number
     }[]
     modifier_groups_count: number
     ```

  6. Update `getAdminMenuItemDetails` to include modifier groups:
     - Join with item_modifier_groups and modifier_groups
     - Include items_count for each group
  </action>
  <verify>
  grep -q "getItemModifierGroups" app/manage/actions/admin-merchant/menus.ts
  grep -q "assignModifierGroupToItem" app/manage/actions/admin-merchant/menus.ts
  grep -q "removeModifierGroupFromItem" app/manage/actions/admin-merchant/menus.ts
  grep -q "modifier_groups_count" app/manage/actions/admin-merchant/menus.ts
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - getItemModifierGroups server action exists
  - assignModifierGroupToItem server action exists
  - removeModifierGroupFromItem server action exists
  - updateItemModifierGroupOrder server action exists
  - AdminMenuItem type includes modifier_groups and modifier_groups_count
  - All actions use assertHQPermission
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Add React Query hook for item modifier groups</name>
  <files>lib/queries/admin-keys.ts, lib/queries/use-admin-merchant.ts</files>
  <action>
  1. In `lib/queries/admin-keys.ts`:
     ```typescript
     merchantItemModifiers: (merchantId: string, itemId: string) =>
       ['admin', 'merchant', merchantId, 'item', itemId, 'modifiers'] as const,
     ```

  2. In `lib/queries/use-admin-merchant.ts`:
     ```typescript
     export function useAdminItemModifierGroups(merchantId: string, itemId: string | null) {
       return useQuery({
         queryKey: adminKeys.merchantItemModifiers(merchantId, itemId || ''),
         queryFn: () => itemId ? getItemModifierGroups(merchantId, itemId) : [],
         enabled: !!merchantId && !!itemId,
         staleTime: 2 * 60 * 1000,
       })
     }
     ```

  3. Export the new hook
  </action>
  <verify>
  grep -q "merchantItemModifiers" lib/queries/admin-keys.ts
  grep -q "useAdminItemModifierGroups" lib/queries/use-admin-merchant.ts
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - adminKeys.merchantItemModifiers query key exists
  - useAdminItemModifierGroups hook exists and is exported
  - Hook fetches item modifier groups when itemId is provided
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Update ItemFormSheet to allow modifier group assignment</name>
  <files>app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx</files>
  <action>
  1. Add new section for modifier groups (only in edit mode):
     ```tsx
     {isEdit && (
       <BottomSheetSection title="Modifier Groups">
         <p className="text-sm text-muted-foreground mb-3">
           Attach modifier groups to allow customers to customize this item.
         </p>

         {/* Currently assigned modifiers */}
         {itemModifierGroups.length > 0 ? (
           <div className="space-y-2 mb-4">
             {itemModifierGroups.map((group) => (
               <div key={group.id} className="flex items-center justify-between p-3 border rounded-lg">
                 <div>
                   <p className="font-medium">{group.name}</p>
                   <p className="text-xs text-muted-foreground">
                     {group.items_count} options
                     {group.is_required && <Badge variant="outline" className="ml-2 text-xs">Required</Badge>}
                   </p>
                 </div>
                 <Button variant="ghost" size="sm" onClick={() => handleRemoveModifierGroup(group.id)}>
                   <X className="h-4 w-4" />
                 </Button>
               </div>
             ))}
           </div>
         ) : (
           <p className="text-sm text-muted-foreground mb-4">No modifier groups attached.</p>
         )}

         {/* Add modifier group dropdown */}
         <div className="flex gap-2">
           <Select value={selectedModifierGroup} onValueChange={setSelectedModifierGroup}>
             <SelectTrigger className="flex-1">
               <SelectValue placeholder="Select a modifier group..." />
             </SelectTrigger>
             <SelectContent>
               {availableModifierGroups.map((group) => (
                 <SelectItem key={group.id} value={group.id}>
                   {group.name} ({group.items_count} options)
                 </SelectItem>
               ))}
             </SelectContent>
           </Select>
           <Button onClick={handleAddModifierGroup} disabled={!selectedModifierGroup}>
             <Plus className="h-4 w-4 mr-2" />
             Add
           </Button>
         </div>
       </BottomSheetSection>
     )}
     ```

  2. Add state and handlers:
     ```typescript
     const [selectedModifierGroup, setSelectedModifierGroup] = useState<string>('')
     const [itemModifierGroups, setItemModifierGroups] = useState<ModifierGroup[]>([])

     // Fetch all modifier groups for this merchant
     const { data: allModifierGroups } = useAdminModifierGroups(merchantId, locationId)

     // Fetch modifier groups already on this item
     const { data: currentItemModifiers } = useAdminItemModifierGroups(merchantId, isEdit ? item?.id : null)

     // Filter out already assigned groups
     const availableModifierGroups = (allModifierGroups || []).filter(
       (g) => !itemModifierGroups.some((ig) => ig.id === g.id)
     )

     const handleAddModifierGroup = async () => {
       if (!selectedModifierGroup || !item) return
       try {
         await assignModifierGroupToItem(merchantId, item.id, selectedModifierGroup)
         queryClient.invalidateQueries({
           queryKey: adminKeys.merchantItemModifiers(merchantId, item.id)
         })
         setSelectedModifierGroup('')
         toast.success('Modifier group added')
       } catch {
         toast.error('Failed to add modifier group')
       }
     }

     const handleRemoveModifierGroup = async (groupId: string) => {
       if (!item) return
       try {
         await removeModifierGroupFromItem(merchantId, item.id, groupId)
         queryClient.invalidateQueries({
           queryKey: adminKeys.merchantItemModifiers(merchantId, item.id)
         })
         toast.success('Modifier group removed')
       } catch {
         toast.error('Failed to remove modifier group')
       }
     }
     ```

  3. Sync currentItemModifiers to local state on load:
     ```typescript
     useEffect(() => {
       if (currentItemModifiers) {
         setItemModifierGroups(currentItemModifiers)
       }
     }, [currentItemModifiers])
     ```
  </action>
  <verify>
  grep -q "Modifier Groups" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx
  grep -q "handleAddModifierGroup" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx
  grep -q "handleRemoveModifierGroup" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx
  grep -q "useAdminItemModifierGroups" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - ItemFormSheet has "Modifier Groups" section (only in edit mode)
  - Shows currently assigned modifier groups with remove button
  - Has dropdown to select and add modifier groups
  - Calls assignModifierGroupToItem on add
  - Calls removeModifierGroupFromItem on remove
  - Invalidates queries after changes
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 4: Update ItemDetailSheet to display assigned modifier groups</name>
  <files>app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx</files>
  <action>
  1. Fetch modifier groups for the item using useAdminItemModifierGroups hook

  2. Add section to display modifier groups:
     ```tsx
     <BottomSheetSection title="Modifier Groups">
       {modifierGroups.length > 0 ? (
         <div className="space-y-2">
           {modifierGroups.map((group) => (
             <Collapsible key={group.id}>
               <CollapsibleTrigger asChild>
                 <div className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                   <div className="flex items-center gap-2">
                     <ChevronRight className="h-4 w-4" />
                     <span className="font-medium">{group.name}</span>
                     {group.is_required && <Badge variant="outline" className="text-xs">Required</Badge>}
                   </div>
                   <span className="text-sm text-muted-foreground">{group.items_count} options</span>
                 </div>
               </CollapsibleTrigger>
               <CollapsibleContent>
                 <div className="ml-6 mt-2 space-y-1">
                   {group.items?.map((item) => (
                     <div key={item.id} className="flex justify-between text-sm p-2 bg-muted/30 rounded">
                       <span>{item.name}</span>
                       {item.price_modifier !== 0 && (
                         <span className={item.price_modifier > 0 ? 'text-green-600' : 'text-red-600'}>
                           {item.price_modifier > 0 ? '+' : ''}{formatCurrency(item.price_modifier)}
                         </span>
                       )}
                     </div>
                   ))}
                 </div>
               </CollapsibleContent>
             </Collapsible>
           ))}
         </div>
       ) : (
         <p className="text-sm text-muted-foreground">No modifier groups attached to this item.</p>
       )}
     </BottomSheetSection>
     ```

  3. Import Collapsible, CollapsibleTrigger, CollapsibleContent from shadcn/ui
  4. Import ChevronRight icon from lucide-react
  </action>
  <verify>
  grep -q "Modifier Groups" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx
  grep -q "useAdminItemModifierGroups" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx
  grep -q "Collapsible" app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx
  npm run typecheck 2>&1 | head -20
  </verify>
  <done>
  - ItemDetailSheet has "Modifier Groups" section
  - Fetches modifier groups using useAdminItemModifierGroups hook
  - Shows modifier groups with expandable options list
  - Displays price modifiers for each option
  - Shows "Required" badge for required groups
  - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 5: Update ItemsTable to show modifier groups count</name>
  <files>app/manage/merchants/[merchantId]/components/MenuTab/ItemsTable.tsx</files>
  <action>
  1. Add column or badge showing modifier groups count:
     ```tsx
     {item.modifier_groups_count > 0 && (
       <Badge variant="outline" className="text-xs">
         <Sliders className="h-3 w-3 mr-1" />
         {item.modifier_groups_count} modifiers
       </Badge>
     )}
     ```

  2. This can be displayed in the Categories column cell or as a separate indicator

  3. Import Sliders icon from lucide-react (or use a similar icon like Settings2)
  </action>
  <verify>
  grep -q "modifier_groups_count" app/manage/merchants/[merchantId]/components/MenuTab/ItemsTable.tsx
  grep -q "modifiers" app/manage/merchants/[merchantId]/components/MenuTab/ItemsTable.tsx
  npm run typecheck 2>&1 | head -20
  npm run build 2>&1 | head -50
  </verify>
  <done>
  - ItemsTable displays modifier groups count badge for items with modifiers
  - Badge shows icon and count (e.g., "2 modifiers")
  - Only displays when modifier_groups_count > 0
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
1. Admin can view which modifier groups are assigned to an item (in ItemDetailSheet and ItemFormSheet)
2. Admin can assign an existing modifier group to an item from ItemFormSheet
3. Admin can remove a modifier group from an item in ItemFormSheet
4. ItemsTable displays modifier group count badge for items that have modifiers
5. ItemDetailSheet shows modifier groups with expandable options list
6. Build passes with no TypeScript errors
7. All operations use assertHQPermission for authorization
</success_criteria>

<output>
After completion, create `.planning/phases/01-menu-management/01-04-SUMMARY.md`
</output>
