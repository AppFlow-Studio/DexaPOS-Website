"use client";

import React, { useState, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
  User,
  ArrowLeft,
  Wifi,
  Coffee,
  Search,
  LayoutGrid,
  List,
  Utensils,
  Plus,
  Send,
  MoreHorizontal,
  Clock,
  Table,
  Logs,
  PackagePlus,
  Sofa,
  ChevronRight,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MenuPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menu: MenuWithCategories | null;
  locationName?: string;
}

// POS-style Item Card matching MenuItem.tsx reference
function POSItemCard({ item }: { item: MenuCategoryItem }) {
  const menuItem = item.menu_item;
  const effectivePrice = menuItem.effective_price ?? 0;
  const effectiveCashPrice = menuItem.effective_cash_price;
  const isAvailable = menuItem.effective_availability ?? true;

  // Visual parity check - assuming modifiers generally exist or checking data
  const hasModifiers = true;

  return (
    <div
      className={cn(
        "flex flex-col  rounded-[20px] border transition-all h-[180px] relative overflow-hidden",
        "bg-[#303030] border-[#4B5563] group cursor-pointer",
        !isAvailable && "opacity-50"
      )}
    >
      {/* Top Section: Placeholder Image + Modifier Icon */}
      <div className="relative h-[85px] w-full flex items-center justify-center pt-2">
        {/* Center Icon */}
        <Utensils className="w-8 h-8 text-gray-400" />

        {/* Modifier Icon (Bottom Right of Top Section) */}
        {hasModifiers && (
          <div className="absolute bottom-1 right-3">
            <Settings className="w-5 h-5 text-blue-400" />
          </div>
        )}
      </div>

      {/* Blue Divider Line */}
      <div className="h-[1.5px] bg-[#60A5FA] w-[90%] mx-auto mb-2" />

      {/* Bottom Content Section */}
      <div className="flex-1 flex flex-col justify-start px-4 pb-3 w-full gap-1">
        {/* Item Name */}
        <h4 className="font-bold text-white text-[16px] leading-tight line-clamp-1 mt-1">
          {menuItem.name}
        </h4>

        {/* Pricing Row */}
        <div className="flex items-baseline flex-wrap gap-x-2">
          <span className="text-[19px] font-bold text-white">
            ${effectivePrice.toFixed(2)}
          </span>
          {effectiveCashPrice && (
            <span className="text-[13px] text-gray-300 font-normal">
              Cash Price: ${effectiveCashPrice.toFixed(2)}
            </span>
          )}
        </div>

        {/* Stock Status Row */}
        <div className="flex items-center gap-2 mt-auto">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              isAvailable ? "bg-[#22C55E]" : "bg-red-500"
            )}
          />
          <span
            className={cn(
              "text-[13px] font-medium",
              isAvailable ? "text-[#4ADE80]" : "text-red-400"
            )}
          >
            {isAvailable ? "In Stock" : "Out of Stock"}
          </span>
        </div>
      </div>
    </div>
  );
}

// Category Pill
function CategoryPill({
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
        "px-5 py-2.5 rounded-lg whitespace-nowrap transition-all text-sm font-semibold border shadow-sm",
        isActive
          ? "bg-[#3b82f6] text-white border-[#3b82f6] shadow-blue-900/20"
          : "bg-[#303030] text-gray-400 border border-gray-600 hover:bg-[#404040] hover:text-gray-200"
      )}
    >
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
      <DialogContent className="sm:max-w-[1280px] w-[95vw] h-[90vh] p-0 border-none bg-[#212121] flex flex-col overflow-hidden rounded-[24px] shadow-2xl ring-1 ring-white/10 my-auto focus:outline-none font-sans">
        {/* Top Status Bar (Unified) */}
        <div className="h-14 bg-[#1a1a1a] border-b border-[#2d2d2d] flex items-center justify-between px-6 shrink-0 z-50">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white hover:bg-[#2d2d2d] -ml-2 gap-2"
              onClick={() => onOpenChange(false)}
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">Exit</span>
            </Button>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <div className="bg-[#262626] border border-[#383838] rounded-full px-4 py-1.5 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse"></div>
              <span className="text-gray-200 text-xs font-bold tracking-wide uppercase">
                Online
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 px-4 bg-[#2563EB] text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg shadow-blue-900/20">
              <User className="w-4 h-4 mr-2" />
              Staff
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden bg-[#212121]">
          {/* LEFT PANEL: BillSection (#303030) */}
          <div className="w-[380px] bg-[#303030] flex flex-col shrink-0 relative z-20 border-r border-[#404040]">
            {/* Order Details Header (Two Columns: Customer, Order Type) */}
            <div className="p-4 px-5 bg-[#212121] pb-6">
              <div className="flex gap-3">
                {/* Customer Column */}
                <div className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-white font-semibold text-lg">
                    Customer
                  </span>
                  <button className="flex w-full items-center justify-center px-1 py-2 border-2 border-dashed border-gray-700 rounded-lg bg-[#303030] h-12 gap-1.5 hover:bg-[#3a3a3a] transition-colors group">
                    <Plus className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                    <span className="text-base font-semibold text-gray-300 group-hover:text-white whitespace-nowrap transition-colors">
                      Add Customer
                    </span>
                  </button>
                  <div className="w-full text-left px-1">
                    <span className="text-xs text-gray-500 font-medium tracking-wide">
                      New Order
                    </span>
                  </div>
                </div>

                {/* Order Type Column */}
                <div className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-white font-semibold text-lg">
                    Order Type
                  </span>
                  <button className="w-full flex items-center justify-between px-3 py-2 border border-gray-700/50 rounded-lg bg-[#303030] h-12 hover:bg-[#3a3a3a] transition-colors">
                    <span className="text-base font-semibold text-white whitespace-nowrap">
                      Takeaway
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>
                  <div className="w-full text-right px-1">
                    <span className="text-xs text-blue-400 font-bold tracking-wide">
                      0 Items
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cart Items List / Empty State */}
            <div className="flex-1 flex flex-col items-center justify-center bg-[#212121] border-t border-gray-800/50">
              <div className="h-full w-full flex items-center justify-center pb-20">
                <span className="text-xl text-gray-500 font-medium">
                  Order is empty.
                </span>
              </div>
            </div>

            {/* Bill Actions */}
            <div className="bg-[#212121] px-5 py-3 space-y-3 border-t border-gray-800">
              <div className="flex justify-between items-center px-1">
                <span className="text-base text-gray-400 font-medium">Tax</span>
                <span className="text-base font-bold text-white">$0.00</span>
              </div>

              {/* Action Buttons Row 1 */}
              <div className="flex gap-3">
                <Button className="flex-1 h-12 bg-[#303030] border border-gray-600 rounded-xl hover:bg-[#3a3a3a] text-white font-bold text-lg gap-2 shadow-sm active:scale-[0.98] transition-all">
                  <Plus className="w-5 h-5 text-[#22c55e]" />
                  <span className="whitespace-nowrap">New Order</span>
                </Button>
                <Button
                  disabled
                  className="flex-1 h-12 bg-[#212121] border border-gray-600 rounded-xl text-gray-500 font-bold text-lg gap-2 opacity-50 shadow-none"
                >
                  <span className="whitespace-nowrap">Send (0)</span>
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              <div className="h-px bg-gray-700 w-full my-1" />

              {/* Action Buttons Row 2 */}
              <div className="flex gap-3">
                <Button className="flex-1 h-12 bg-[#303030] border border-gray-600 rounded-xl hover:bg-[#3a3a3a] text-white font-bold text-lg shadow-sm active:scale-[0.98] transition-all">
                  More
                </Button>
                <Button
                  disabled
                  className="flex-1 h-12 bg-gray-600 rounded-xl text-gray-400 font-bold text-lg gap-2 opacity-60 shadow-none"
                >
                  Pay $0.00
                </Button>
              </div>

              {/* Pay Cash Banner */}
              <div className="w-full py-2 bg-green-900/20 border border-green-600/30 rounded-lg flex items-center justify-center">
                <span className="text-sm text-green-400 font-medium">
                  Pay cash: $0.00 (save $0.00)
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: MenuSection (#212121) */}
          <div className="flex-1 flex flex-col bg-[#212121] p-4 pt-0">
            {/* Visual Accordion (Order Line) */}
            <div className="py-4 px-2">
              <div className="flex items-center gap-2 mb-2">
                <ChevronRight className="w-5 h-5 text-gray-500" />
                <h2 className="text-2xl font-bold text-white">Order Line</h2>
              </div>
            </div>

            {/* Menu Header Toolbar */}
            <div className="flex flex-row items-center justify-between pb-4 px-2">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white">Menu</h2>
                <button className="flex flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-3 py-2 cursor-pointer hover:bg-[#3a3a3a]">
                  <span className="text-white font-medium mr-2 text-base">
                    Order Type:
                  </span>
                  <span className="text-blue-400 font-semibold text-base">
                    Takeaway
                  </span>
                </button>
              </div>

              <div className="flex flex-row items-center gap-2">
                <div className="flex flex-row items-center bg-[#303030] rounded-lg p-1 border border-gray-600">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-10 h-10 hover:bg-[#404040]"
                  >
                    <Table className="w-5 h-5 text-gray-400" />
                  </Button>
                </div>
                <div className="flex flex-row items-center bg-[#303030] rounded-lg p-1 border border-gray-600">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-10 h-10 hover:bg-[#404040]"
                  >
                    <Search className="w-5 h-5 text-gray-400" />
                  </Button>
                </div>
                <div className="flex flex-row items-center bg-[#303030] rounded-lg p-1 border border-gray-600">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-10 h-10 hover:bg-[#404040]"
                  >
                    <PackagePlus className="w-5 h-5 text-gray-400" />
                  </Button>
                </div>

                {/* Sofa Icon */}
                <div className="flex flex-row items-center bg-[#303030] rounded-lg p-1 border border-gray-600">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-10 h-10 hover:bg-[#404040]"
                  >
                    <Sofa className="w-5 h-5 text-gray-400" />
                  </Button>
                </div>

                <button className="flex flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-3 py-2.5 ml-2 hover:bg-[#404040] gap-2">
                  <Logs className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-300 font-medium">Orders</span>
                </button>

                <button className="h-12 flex flex-row items-center justify-between border border-gray-600 bg-[#303030] rounded-lg px-4 gap-4 ml-2 min-w-[160px] hover:bg-[#404040]">
                  <span className="text-white font-medium text-lg truncate max-w-[120px]">
                    {menu?.name || "Select Menu"}
                  </span>
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Menu Categories Pill List */}
            <div className="px-2 pb-4">
              <ScrollArea className="w-full">
                <div className="flex gap-2 pb-2">
                  {visibleCategories.map((cat) => (
                    <CategoryPill
                      key={cat.category_id}
                      category={cat}
                      isActive={cat.category_id === activeCategory?.category_id}
                      onClick={() => setSelectedCategoryId(cat.category_id)}
                    />
                  ))}
                </div>
                <ScrollBar orientation="horizontal" className="h-2" />
              </ScrollArea>
            </div>

            {/* Items Grid */}
            <ScrollArea className="flex-1 px-2 pb-6">
              <div className="pb-20">
                {categoryItems.length > 0 ? (
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {categoryItems.map((item) => (
                      <POSItemCard key={item.menu_item_id} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                    <Coffee className="w-12 h-12 mb-4 opacity-10" />
                    <p>No items in this category</p>
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
