"use client";

import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  MenuWithCategories,
  MenuCategory,
  MenuCategoryItem,
} from "@/types/menu";
import {
  ChevronDown,
  ArrowLeft,
  Coffee,
  Search,
  Utensils,
  Plus,
  Send,
  LayoutGrid,
  MoreHorizontal,
  Settings,
  Users,
  Logs,
} from "lucide-react";

interface MenuPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menu: MenuWithCategories | null;
  locationName?: string;
}

// POS-style Item Card matching the real POS tablet UI
function POSItemCard({ item }: { item: MenuCategoryItem }) {
  const menuItem = item.menu_item;
  const effectivePrice = menuItem.effective_price ?? 0;
  const effectiveCashPrice = menuItem.effective_cash_price;
  const isAvailable = menuItem.effective_availability ?? true;
  const imageUrl = menuItem.image;

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl overflow-hidden cursor-pointer transition-all duration-200",
        "bg-[#1e293b] hover:ring-2 hover:ring-[#2dd4bf]/40 hover:scale-[1.02] hover:brightness-110",
        !isAvailable && "opacity-40"
      )}
    >
      {/* Image Section */}
      <div className="relative h-[144px] w-full bg-[#1e293b]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={menuItem.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center bg-[#253349]">
            <Utensils className="w-10 h-10 text-[#475569]" />
            <span className="text-xs text-[#475569] mt-2 font-medium">No image</span>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="px-3 py-2.5 flex flex-col gap-1">
        <h4 className="font-semibold text-white text-sm leading-tight line-clamp-1">
          {menuItem.name}
        </h4>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white">
            ${effectivePrice.toFixed(2)}
          </span>
          {effectiveCashPrice != null && (
            <span className="text-xs font-semibold text-[#0f172a] bg-[#2dd4bf] rounded px-2 py-0.5">
              ${effectiveCashPrice.toFixed(2)}
            </span>
          )}
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
        "px-4 py-2 whitespace-nowrap transition-all text-sm font-medium",
        isActive
          ? "text-[#2dd4bf] border-b-2 border-[#2dd4bf]"
          : "text-[#94a3b8] hover:text-white"
      )}
    >
      {category.category?.name || "Category"}
    </button>
  );
}

// Sample order ticket
function OrderTicket({
  number,
  status,
}: {
  number: string;
  status: "preparing" | "ready";
}) {
  return (
    <div className="flex items-center gap-2 bg-[#1e293b] border border-[#334155] rounded-full px-3 py-1.5 shrink-0">
      <div
        className={cn(
          "w-2 h-2 rounded-full",
          status === "preparing"
            ? "bg-[#2dd4bf] animate-pulse"
            : "bg-[#f59e0b]"
        )}
      />
      <span className="text-white text-xs font-semibold">{number}</span>
      <span className="text-[#94a3b8] text-xs">{status}</span>
      <MoreHorizontal className="w-3 h-3 text-[#64748b]" />
    </div>
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
      <DialogContent className="sm:max-w-[1280px] w-[95vw] max-sm:w-screen max-sm:h-dvh h-[90vh] p-0 border-none bg-[#0f172a] flex flex-col overflow-hidden rounded-2xl max-sm:rounded-none shadow-2xl ring-1 ring-white/5 my-auto focus:outline-none font-sans">
        <DialogTitle className="sr-only">
          {menu?.name ? `${menu.name} preview` : "Menu preview"}
        </DialogTitle>
        {/* Top Status Bar */}
        <div className="h-12 bg-[#0f172a] border-b border-[#1e293b] flex items-center justify-between px-5 shrink-0 z-50">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-[#94a3b8] hover:text-white hover:bg-[#1e293b] -ml-2 gap-2"
              onClick={() => onOpenChange(false)}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="font-medium text-sm">Back to Menu</span>
            </Button>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <div className="bg-[#1e293b] border border-[#334155] rounded-full px-3 py-1 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
              <span className="text-white text-xs font-semibold">Online</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-[#2dd4bf] flex items-center justify-center text-xs font-bold text-[#0f172a]">
              TB
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-x-auto overflow-y-hidden">
          {/* LEFT PANEL: Cart / Bill */}
          <div className="w-[300px] sm:w-[340px] bg-[#0b1120] flex flex-col shrink-0 border-r border-[#1e293b]">
            {/* Customer & Order Type */}
            <div className="p-4 space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <span className="text-[#94a3b8] text-xs font-medium">Customer</span>
                  <button className="flex w-full items-center justify-center gap-1.5 px-2 py-2.5 border border-dashed border-[#2dd4bf]/40 rounded-lg bg-transparent hover:bg-[#1e293b] transition-colors">
                    <Plus className="w-4 h-4 text-[#2dd4bf]" />
                    <span className="text-sm font-medium text-[#2dd4bf]">
                      Add Customer
                    </span>
                  </button>
                </div>
                <div className="flex-1 space-y-1.5">
                  <span className="text-[#94a3b8] text-xs font-medium">Order Type</span>
                  <button className="w-full flex items-center justify-between px-3 py-2.5 border border-[#334155] rounded-lg bg-[#1e293b] hover:bg-[#334155] transition-colors">
                    <span className="text-sm font-medium text-white">
                      Takeaway
                    </span>
                    <ChevronDown className="w-4 h-4 text-[#64748b]" />
                  </button>
                </div>
              </div>
            </div>

            {/* Empty Cart */}
            <div className="flex-1 flex items-center justify-center border-t border-[#1e293b]">
              <span className="text-sm text-[#475569]">
                Order is empty.
              </span>
            </div>

            {/* Bill Actions */}
            <div className="p-4 space-y-3 border-t border-[#1e293b]">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#94a3b8]">Tax</span>
                <span className="text-sm font-semibold text-white">$0.00</span>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1 h-10 bg-[#1e293b] border border-[#334155] rounded-lg hover:bg-[#334155] text-white font-medium text-sm gap-1.5">
                  <Plus className="w-4 h-4 text-[#22c55e]" />
                  New Order
                </Button>
                <Button
                  disabled
                  className="flex-1 h-10 bg-[#1e293b] border border-[#334155] rounded-lg text-[#475569] font-medium text-sm gap-1.5 opacity-50"
                >
                  Send to Kitchen
                  <Send className="w-3 h-3" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1 h-10 bg-[#1e293b] border border-[#334155] rounded-lg hover:bg-[#334155] text-white font-medium text-sm">
                  <MoreHorizontal className="w-4 h-4 mr-1.5" />
                  More
                </Button>
                <Button
                  disabled
                  className="flex-1 h-10 bg-[#2dd4bf] rounded-lg text-[#0f172a] font-bold text-sm opacity-60"
                >
                  Pay $0.00
                </Button>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Menu Section */}
          <div className="flex-1 min-w-[480px] flex flex-col bg-[#0f172a] overflow-hidden">
            {/* Order Line Header + Tickets */}
            <div className="px-5 pt-4 pb-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-white">Order Line</h2>
                  <span className="text-xs font-semibold text-[#94a3b8] bg-[#1e293b] rounded-full px-2 py-0.5">
                    0
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-[#1e293b] border border-[#334155] rounded-lg p-0.5">
                    <Button size="icon" variant="ghost" className="w-8 h-8 hover:bg-[#334155]">
                      <LayoutGrid className="w-4 h-4 text-[#94a3b8]" />
                    </Button>
                  </div>
                  <div className="flex items-center bg-[#1e293b] border border-[#334155] rounded-lg p-0.5">
                    <Button size="icon" variant="ghost" className="w-8 h-8 hover:bg-[#334155]">
                      <Search className="w-4 h-4 text-[#94a3b8]" />
                    </Button>
                  </div>
                  <div className="flex items-center bg-[#1e293b] border border-[#334155] rounded-lg p-0.5">
                    <Button size="icon" variant="ghost" className="w-8 h-8 hover:bg-[#334155]">
                      <Settings className="w-4 h-4 text-[#94a3b8]" />
                    </Button>
                  </div>
                  <div className="flex items-center bg-[#1e293b] border border-[#334155] rounded-lg p-0.5">
                    <Button size="icon" variant="ghost" className="w-8 h-8 hover:bg-[#334155]">
                      <Users className="w-4 h-4 text-[#94a3b8]" />
                    </Button>
                  </div>
                  <button className="flex items-center bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-1.5 hover:bg-[#334155] gap-1.5">
                    <Logs className="w-4 h-4 text-[#94a3b8]" />
                    <span className="text-[#94a3b8] text-sm font-medium">Orders</span>
                  </button>
                  <button className="flex items-center justify-between bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-1.5 hover:bg-[#334155] min-w-[140px]">
                    <span className="text-white text-sm font-medium truncate max-w-[100px]">
                      {menu?.name || "Select Menu"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-[#64748b] ml-2" />
                  </button>
                </div>
              </div>

              {/* Order Tickets Row */}
              <ScrollArea className="w-full">
                <div className="flex gap-2 pb-1">
                  <OrderTicket number="#S1-0009" status="preparing" />
                  <OrderTicket number="#S1-0007" status="ready" />
                  <OrderTicket number="#S1-0006" status="ready" />
                  <OrderTicket number="#S1-0004" status="ready" />
                </div>
                <ScrollBar orientation="horizontal" className="h-1.5" />
              </ScrollArea>
            </div>

            {/* Category Tabs */}
            <div className="px-5 border-b border-[#1e293b]">
              <ScrollArea className="w-full">
                <div className="flex gap-1">
                  {visibleCategories.map((cat) => (
                    <CategoryTab
                      key={cat.category_id}
                      category={cat}
                      isActive={cat.category_id === activeCategory?.category_id}
                      onClick={() => setSelectedCategoryId(cat.category_id)}
                    />
                  ))}
                </div>
                <ScrollBar orientation="horizontal" className="h-1.5" />
              </ScrollArea>
            </div>

            {/* Items Grid */}
            <ScrollArea className="flex-1 px-5 pt-4 overflow-y-auto">
              <div className="pb-16">
                {categoryItems.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {categoryItems.map((item) => (
                      <POSItemCard key={item.menu_item_id} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-[#475569]">
                    <Coffee className="w-12 h-12 mb-4 opacity-20" />
                    <p className="text-sm">No items in this category</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
