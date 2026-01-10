"use client";

import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  MenuWithCategories,
  MenuCategory,
  MenuCategoryItem,
} from "@/types/menu";
import { Tablet, X, Coffee, Package } from "lucide-react";

interface MenuPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menu: MenuWithCategories | null;
  locationName?: string;
}

// Preview Item Card - matching tablet style
function PreviewItemCard({ item }: { item: MenuCategoryItem }) {
  const menuItem = item.menu_item;
  const effectivePrice = menuItem.effective_price ?? 0;
  const effectiveCashPrice = menuItem.effective_cash_price;
  const isAvailable = menuItem.effective_availability ?? true;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border-2 overflow-hidden transition-all",
        "bg-slate-800 border-slate-700 hover:border-slate-600",
        !isAvailable && "opacity-50"
      )}
    >
      {/* Image/Icon Area */}
      <div className="aspect-square flex items-center justify-center bg-slate-700/50 relative">
        {menuItem.image ? (
          <img
            src={menuItem.image}
            alt={menuItem.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Coffee className="w-10 h-10 text-slate-500" />
        )}
        {/* Settings icon (decorative) */}
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-slate-600/50 flex items-center justify-center">
          <Package className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-1">
        <h4 className="font-semibold text-white text-sm truncate">
          {menuItem.name}
        </h4>

        {/* Price Row */}
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-white">
            ${effectivePrice.toFixed(2)}
          </span>
          {effectiveCashPrice && effectiveCashPrice !== effectivePrice && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <span className="w-3 h-3 bg-orange-500 rounded-sm text-[8px] font-bold text-white flex items-center justify-center">
                💵
              </span>
              ${effectiveCashPrice.toFixed(2)}
            </span>
          )}
        </div>

        {/* Stock Status */}
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isAvailable ? "bg-emerald-500" : "bg-red-500"
            )}
          />
          <span
            className={cn(
              "text-xs",
              isAvailable ? "text-emerald-400" : "text-red-400"
            )}
          >
            {isAvailable ? "In Stock" : "Out of Stock"}
          </span>
        </div>
      </div>
    </div>
  );
}

// Category Tab
function CategoryTab({
  category,
  isActive,
  onClick,
}: {
  category: MenuCategory;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap transition-all text-sm",
        isActive
          ? "bg-amber-500 text-black font-semibold"
          : "bg-slate-700 text-slate-300 hover:bg-slate-600"
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {category.category?.name || "Category"}
    </button>
  );
}

export function MenuPreviewModal({
  open,
  onOpenChange,
  menu,
  locationName,
}: MenuPreviewModalProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );

  // Get visible categories sorted by display_order
  const visibleCategories = useMemo(() => {
    if (!menu?.categories) return [];
    return menu.categories
      .filter((c) => c.is_active)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  }, [menu?.categories]);

  // Auto-select first category
  const activeCategory = useMemo(() => {
    if (!visibleCategories.length) return null;
    const selected = visibleCategories.find(
      (c) => c.category_id === selectedCategoryId
    );
    return selected || visibleCategories[0];
  }, [visibleCategories, selectedCategoryId]);

  // Get items for active category sorted by display_order
  const categoryItems = useMemo(() => {
    if (!activeCategory?.items) return [];
    return [...activeCategory.items].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
  }, [activeCategory?.items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] md:max-w-[80vw] h-[80vh] md:h-[70vh] p-0 overflow-hidden bg-slate-900 border-slate-700">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
              <Tablet className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <DialogTitle className="text-white text-lg">
                POS Preview
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-sm">
                {menu?.name || "Menu"}
                {locationName && ` • ${locationName}`}
              </DialogDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Menu Dropdown Mock */}
        <div className="px-4 py-2 border-b border-slate-700 flex items-center gap-3">
          <Badge className="bg-slate-700 text-white hover:bg-slate-600 px-3 py-1">
            Menu
          </Badge>
          <Badge className="bg-blue-600 text-white hover:bg-blue-500 px-3 py-1">
            Order Type: Takeaway
          </Badge>
          <div className="flex-1" />
          <Badge
            variant="outline"
            className="border-slate-600 text-slate-300 px-3 py-1"
          >
            {menu?.name || "Standard Menu"}
          </Badge>
        </div>

        {/* Category Tabs */}
        <div className="px-4 py-3 border-b border-slate-700">
          <ScrollArea className="w-full">
            <div className="flex items-center gap-2">
              {visibleCategories.map((category) => (
                <CategoryTab
                  key={category.category_id}
                  category={category}
                  isActive={
                    category.category_id === activeCategory?.category_id
                  }
                  onClick={() => setSelectedCategoryId(category.category_id)}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Items Grid */}
        <ScrollArea className="flex-1 h-full">
          <div className="p-4">
            {categoryItems.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {categoryItems.map((item) => (
                  <PreviewItemCard key={item.menu_item_id} item={item} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Coffee className="w-12 h-12 mb-3" />
                <p className="text-lg">No items in this category</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/50">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {visibleCategories.length} categories •{" "}
              {menu?.categories?.reduce(
                (sum, c) => sum + (c.items?.length || 0),
                0
              ) || 0}{" "}
              items
            </span>
            <span>Preview Mode (Read-Only)</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
