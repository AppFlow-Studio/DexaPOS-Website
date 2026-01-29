import { forwardRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { GripVertical, Pencil, Sparkles, Trash2, Utensils } from 'lucide-react'

interface CategoryItemRowProps {
  item: any // We'll refine this type to match the RPC response
  index: number
  isDragging?: boolean
  dragListeners?: any
  dragAttributes?: any
  style?: React.CSSProperties
  onEdit: () => void
  onRemove: () => void
}

export const CategoryItemRow = forwardRef<HTMLDivElement, CategoryItemRowProps>(({
  item,
  index,
  isDragging,
  dragListeners,
  dragAttributes,
  style,
  onEdit,
  onRemove
}, ref) => {
  // Extract details from the nested menu_item object if it exists (RPC structure)
  // or use the item itself if it's flat
  const details = item.menu_item || item
  
  // Price formatting
  const effectivePrice = details.effective_price ?? details.base_price ?? 0
  
  // Price Source Logic
  const priceSource = details.price_source || 'base'
  const isAvailable = details.effective_availability ?? details.base_availability ?? true

  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 my-1 rounded-lg bg-background border transition-all",
        isDragging
          ? "opacity-30 shadow-lg z-50 ring-2 ring-primary"
          : "hover:shadow-sm hover:border-primary/30",
        !isAvailable && "opacity-60"
      )}
      onClick={onEdit}
    >
      {/* Drag Handle (Placeholder for now until DND is fully accessible) */}
      <div
        {...dragAttributes}
        {...dragListeners}
        className="flex items-center justify-center w-7 h-7 rounded hover:bg-muted cursor-grab active:cursor-grabbing touch-none shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Order Number */}
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium shrink-0">
        {index + 1}
      </span>

      {/* Item Image */}
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted/30 shrink-0 relative">
        {details.image ? (
          <img
            src={details.image}
            alt={details.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Utensils className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}
      </div>

      {/* Item Details */}
      <div className="flex-1 min-w-0">
        <h5 className="font-medium text-sm truncate flex items-center gap-1">
          {details.name}
          {item.is_featured && <Sparkles className="h-3 w-3 text-yellow-500" />}
        </h5>
        {details.description && (
          <p className="text-xs text-muted-foreground truncate">
            {details.description}
          </p>
        )}
      </div>

      {/* Price with source indicator */}
      <div className="text-right shrink-0 flex items-center gap-2">
        <div className="flex flex-col items-end">
          <span className="font-semibold text-sm text-primary">
            ${effectivePrice.toFixed(2)}
          </span>
          {priceSource !== "base" && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                priceSource === "category" &&
                  "text-green-600 border-green-200",
                priceSource === "location_item" &&
                  "text-blue-600 border-blue-200",
                priceSource === "location_category" &&
                  "text-purple-600 border-purple-200",
              )}
            >
              {priceSource === "category" && "Cat"}
              {priceSource === "location_item" && "Loc"}
              {priceSource === "location_category" && "L+C"}
            </Badge>
          )}
        </div>
        {!isAvailable && (
          <Badge variant="secondary" className="text-xs">
            Off
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={onEdit}>
                        <Pencil className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Edit Item</TooltipContent>
            </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onRemove}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Remove from Category</TooltipContent>
            </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
})

CategoryItemRow.displayName = 'CategoryItemRow'
