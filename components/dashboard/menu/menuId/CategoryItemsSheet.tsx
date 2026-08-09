"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Utensils } from "lucide-react";
import { MenuCategory, MenuCategoryItem } from "@/types/menu";
import { cn, isValidImageUrl } from "@/lib/utils";

interface CategoryItemsSheetProps {
  category: MenuCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the edit-item flow for the clicked row. */
  onEditItem: (item: MenuCategoryItem, category: MenuCategory) => void;
}

const formatPrice = (value: number | null | undefined) =>
  typeof value === "number" ? `$${value.toFixed(2)}` : "—";

/**
 * Read-only list of a category's items, opened from the grid card's "See items"
 * button. The grid card itself no longer previews items, so this is where that
 * detail moved. Clicking a row hands off to the normal edit-item flow.
 */
export function CategoryItemsSheet({
  category,
  open,
  onOpenChange,
  onEditItem,
}: CategoryItemsSheetProps) {
  const items = category?.items ?? [];
  const activeCount = items.filter(
    (it) => it.menu_item?.effective_availability,
  ).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="inset-x-auto left-1/2 flex h-[85dvh] w-full max-w-4xl -translate-x-1/2 flex-col gap-0 rounded-t-3xl border-0 p-0 sm:bottom-6 sm:h-[90dvh] sm:max-h-[44rem] sm:w-[calc(100%-3rem)] sm:rounded-3xl"
      >
        <SheetHeader className="space-y-1 border-b border-border/60 px-5 py-4 text-left">
          <SheetTitle className="truncate text-base">
            {category?.category?.name || "Category"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {items.length} {items.length === 1 ? "item" : "items"}
            {items.length > 0 && ` · ${activeCount} available`}
          </SheetDescription>
        </SheetHeader>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-muted/40 px-4 py-10 text-center">
              <Utensils className="h-5 w-5 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No items in this category
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => {
                const menuItem = item.menu_item;
                const image = menuItem?.image;
                const isAvailable = menuItem?.effective_availability;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      category && onEditItem(item, category)
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                      "bg-muted/40 hover:bg-muted/70",
                      !isAvailable && "opacity-60",
                    )}
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background">
                      {isValidImageUrl(image) ? (
                        <img
                          src={image as string}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Utensils className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {menuItem?.name || "Item"}
                        </span>
                        {item.is_featured && (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-0 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                          >
                            Featured
                          </Badge>
                        )}
                      </div>
                      {menuItem?.description && (
                        <p className="truncate text-xs text-muted-foreground">
                          {menuItem.description}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums">
                        {formatPrice(menuItem?.effective_price)}
                      </div>
                      {!isAvailable && (
                        <div className="text-[10px] text-muted-foreground">
                          Unavailable
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default CategoryItemsSheet;
