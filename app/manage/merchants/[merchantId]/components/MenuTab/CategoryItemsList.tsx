'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Utensils, GripVertical, Save, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { CategoryItemRow } from './CategoryItemRow'
import { updateAdminCategoryItemsOrder } from '@/app/manage/actions/admin-merchant/menus'

interface CategoryItemsListProps {
  merchantId: string
  categoryId: string
  items: any[]
  onSuccess: () => void
  onEditItem: (itemId: string) => void
  onRemoveItem: (itemId: string) => void
}

export function CategoryItemsList({
  merchantId,
  categoryId,
  items: initialItems,
  onSuccess,
  onEditItem,
  onRemoveItem,
}: CategoryItemsListProps) {
  const [items, setItems] = useState<any[]>(initialItems)
  const [isOrdering, setIsOrdering] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)

    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => (i.id || i.menu_item_id) === active.id)
        const newIndex = prev.findIndex((i) => (i.id || i.menu_item_id) === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
      setIsOrdering(true)
    }
  }

  const handleSaveOrder = async () => {
    setIsSaving(true)
    try {
      const orders = items.map((item, i) => ({
        menuItemId: item.menu_item_id || item.id,
        displayOrder: i + 1,
      }))

      const result = await updateAdminCategoryItemsOrder(merchantId, categoryId, orders)
      if (!result.success) throw new Error(result.error)

      toast.success('Items order updated')
      setIsOrdering(false)
      onSuccess()
    } catch (err) {
      toast.error('Failed to update item order')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setItems(initialItems)
    setIsOrdering(false)
  }

  if (!items || items.length === 0) {
    return (
      <div className="py-6 text-center text-muted-foreground">
        <Utensils className="h-8 w-8 mx-auto mb-2 opacity-20" />
        <p className="text-sm">No items in this category</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {isOrdering && (
        <div className="flex items-center justify-between p-2 mb-2 bg-primary/5 border border-primary/20 rounded-md animate-in fade-in slide-in-from-top-1">
          <span className="text-xs font-medium text-primary ml-1">Items order changed</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
            <Button size="sm" onClick={handleSaveOrder} disabled={isSaving} className="h-7 text-xs">
              {isSaving ? 'Saving...' : (
                <>
                  <Save className="h-3 w-3 mr-1" />
                  Save Order
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.id || i.menu_item_id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item, index) => (
            <SortableItemRow
              key={item.id || item.menu_item_id}
              item={item}
              index={index}
              onEdit={() => onEditItem(item.menu_item_id || item.id)}
              onRemove={() => onRemoveItem(item.menu_item_id || item.id)}
            />
          ))}
        </SortableContext>
        <DragOverlay>
          {activeDragId ? (
            <div className="opacity-80">
              <div className="p-3 border rounded-lg bg-background shadow-lg flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {items.find((i) => (i.id || i.menu_item_id) === activeDragId)?.menu_item?.name || 
                   items.find((i) => (i.id || i.menu_item_id) === activeDragId)?.name}
                </span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function SortableItemRow({ item, index, onEdit, onRemove }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id || item.menu_item_id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <CategoryItemRow
      ref={setNodeRef}
      style={style}
      item={item}
      index={index}
      isDragging={isDragging}
      dragAttributes={attributes}
      dragListeners={listeners}
      onEdit={onEdit}
      onRemove={onRemove}
    />
  )
}
