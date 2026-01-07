"use client";

import { useState, useEffect, useMemo } from "react";
import {
  StorefrontMenu,
  StorefrontItem,
  StorefrontCategory,
} from "@/types/storefront";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, X, ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "../hooks/useCart";
import { ItemDetailsModal } from "./ItemDetailsModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MenuBrowserProps {
  menus: StorefrontMenu[];
}

export function MenuBrowser({ menus }: MenuBrowserProps) {
  const [activeMenuId, setActiveMenuId] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<StorefrontItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    if (menus.length > 0 && !activeMenuId) {
      setActiveMenuId(menus[0].id);
    }
  }, [menus, activeMenuId]);

  const activeMenu = menus.find((m) => m.id === activeMenuId);

  // Auto-set the first category as active when menu changes
  useEffect(() => {
    if (activeMenu?.categories?.length) {
      setActiveCategory(activeMenu.categories[0].id);
    }
  }, [activeMenu]);

  const handleItemClick = (item: StorefrontItem) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const scrollToCategory = (categoryId: string) => {
    setActiveCategory(categoryId);
    const element = document.getElementById(`category-${categoryId}`);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  // Filter items based on search query
  const filteredCategories = useMemo(() => {
    if (!activeMenu?.categories || !searchQuery.trim()) {
      return activeMenu?.categories || [];
    }

    const query = searchQuery.toLowerCase().trim();
    return activeMenu.categories
      .map((category) => ({
        ...category,
        items: category.items.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            item.description?.toLowerCase().includes(query)
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [activeMenu?.categories, searchQuery]);

  if (!activeMenu || menus.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="bg-muted rounded-full p-4 mb-4">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold">No menus available</h3>
        <p className="text-muted-foreground mt-2">
          This location hasn't set up their online menu yet.
        </p>
      </div>
    );
  }

  const categories = searchQuery.trim()
    ? filteredCategories
    : activeMenu.categories;

  return (
    <div className="space-y-6">
      <ItemDetailsModal
        item={selectedItem}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Search Bar */}
      <div className="relative">
        <AnimatePresence>
          {isSearchOpen ? (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "100%" }}
              exit={{ opacity: 0, width: 0 }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search menu items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 h-11 bg-white border-gray-200 shadow-sm"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchQuery("");
                }}
                className="shrink-0"
              >
                <X className="h-5 w-5" />
              </Button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-end"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSearchOpen(true)}
                className="gap-2 bg-white shadow-sm"
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Search menu</span>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Menu Selector + Category Pills - Compact layout */}
      <div className="lg:hidden sticky top-[64px] z-30 bg-gray-50/95 backdrop-blur-sm -mx-4 px-4 py-3 space-y-3 shadow-sm border-b">
        {/* Menu Dropdown - Only show if multiple menus */}
        {menus.length > 1 && (
          <Select value={activeMenuId} onValueChange={setActiveMenuId}>
            <SelectTrigger className="w-full bg-white border-gray-200 h-10 font-medium text-gray-900 shadow-sm">
              <SelectValue placeholder="Select Menu" />
            </SelectTrigger>
            <SelectContent className="z-50">
              {menus.map((menu) => (
                <SelectItem
                  key={menu.id}
                  value={menu.id}
                  className="font-medium"
                >
                  {menu.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Category Pills */}
        <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => scrollToCategory(cat.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-full transition-all border shrink-0",
                activeCategory === cat.id
                  ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Menu Tabs */}
      {menus.length > 1 && (
        <div className="hidden lg:flex overflow-x-auto pb-1 gap-2 border-b no-scrollbar sticky top-[64px] z-30 bg-gray-50/95 pt-2">
          {menus.map((menu) => (
            <button
              key={menu.id}
              onClick={() => setActiveMenuId(menu.id)}
              className={cn(
                "px-4 py-2 text-sm font-bold whitespace-nowrap rounded-t-lg transition-colors border-b-2 -mb-[1px]",
                activeMenuId === menu.id
                  ? "border-[var(--primary)] text-[var(--primary)] bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/50"
              )}
            >
              {menu.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8 relative items-start">
        {/* Desktop Sidebar Nav */}
        <aside className="hidden lg:block w-64 sticky top-32 shrink-0 max-h-[calc(100vh-8rem)] overflow-y-auto pr-4">
          <h3 className="font-bold text-lg mb-4 px-2 text-gray-900">
            Categories
          </h3>
          <nav className="space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  activeCategory === cat.id
                    ? "bg-white text-[var(--primary)] shadow-sm border-l-4 border-[var(--primary)]"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                {cat.name}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-12 pb-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMenu.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {categories.map((category) => (
                <section
                  key={category.id}
                  id={`category-${category.id}`}
                  className="scroll-mt-32 mb-10"
                >
                  <div className="mb-6 border-b pb-2">
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                      {category.name}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {category.items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onClick={() => handleItemClick(item)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  onClick,
}: {
  item: StorefrontItem;
  onClick: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className="group bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 shadow-sm hover:shadow-lg hover:border-[var(--primary)]/30 transition-all duration-300 overflow-hidden flex flex-row cursor-pointer h-32"
    >
      {/* Content Side */}
      <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
        <div>
          <h4 className="font-bold text-gray-900 dark:text-gray-100 text-base mb-1 group-hover:text-[var(--primary)] transition-colors line-clamp-1 uppercase tracking-wide">
            {item.name}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        </div>

        {/* Price shown only if no image (price badge on image otherwise) */}
        {!item.image && (
          <div className="flex items-center justify-between mt-2">
            <span className="font-bold text-[var(--primary)] text-lg">
              ${item.price.toFixed(2)}
            </span>
            <Button
              size="sm"
              className="rounded-full w-8 h-8 p-0 bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white shadow-md"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Add button only if image exists (price is on image badge) */}
        {item.image && (
          <div className="flex items-center justify-end mt-2">
            <Button
              size="sm"
              className="rounded-full w-8 h-8 p-0 bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white shadow-md group-hover:scale-110 transition-transform"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Image Side with Price Badge */}
      <div className="w-32 h-full shrink-0 relative">
        {item.image ? (
          <div className="h-full w-full bg-gray-100 relative overflow-hidden">
            <img
              src={item.image}
              alt={item.name}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
            />
            {/* Price Badge Overlay */}
            <div className="absolute top-2 right-2 bg-[var(--primary)] text-white text-sm font-bold px-2.5 py-1 rounded-lg shadow-lg">
              ${item.price.toFixed(2)}
            </div>
            {/* Subtle gradient overlay for depth */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-zinc-800 dark:to-zinc-700 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-gray-300 dark:text-zinc-500" />
          </div>
        )}
      </div>
    </motion.div>
  );
}
