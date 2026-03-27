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
import { motion, AnimatePresence } from "motion/react";
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
      window.scrollTo({ top: offsetPosition, behavior: "smooth" });
    }
  };

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
        <div
          className="rounded-full p-4 mb-4"
          style={{ backgroundColor: "var(--card)" }}
        >
          <ImageIcon className="h-8 w-8" style={{ color: "var(--text-secondary)" }} />
        </div>
        <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          No menus available
        </h3>
        <p className="mt-2" style={{ color: "var(--text-secondary)" }}>
          This location hasn&apos;t set up their online menu yet.
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
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: "var(--text-secondary)" }}
                />
                <Input
                  type="text"
                  placeholder="Search menu items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 h-11 shadow-sm"
                  style={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    color: "var(--text)",
                  }}
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--text-secondary)" }}
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
                style={{ color: "var(--text)" }}
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
                className="gap-2 shadow-sm"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Search menu</span>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Menu Selector + Category Pills */}
      <div
        className="lg:hidden sticky top-[64px] z-30 backdrop-blur-sm -mx-4 px-4 py-3 space-y-3 shadow-sm"
        style={{
          backgroundColor: "color-mix(in srgb, var(--bg) 95%, transparent)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {menus.length > 1 && (
          <Select value={activeMenuId} onValueChange={setActiveMenuId}>
            <SelectTrigger
              className="w-full h-10 font-medium shadow-sm"
              style={{
                backgroundColor: "var(--card)",
                borderColor: "var(--border)",
                color: "var(--text)",
              }}
            >
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

        <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => scrollToCategory(cat.id)}
              className="px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-200 shrink-0"
              style={{
                borderRadius: "var(--radius)",
                backgroundColor:
                  activeCategory === cat.id ? "var(--primary)" : "var(--card)",
                color:
                  activeCategory === cat.id ? "var(--primary-text)" : "var(--text-secondary)",
                border: `1px solid ${activeCategory === cat.id ? "var(--primary)" : "var(--border)"}`,
                boxShadow:
                  activeCategory === cat.id
                    ? "0 2px 8px color-mix(in srgb, var(--primary) 30%, transparent)"
                    : "none",
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Menu Tabs */}
      {menus.length > 1 && (
        <div
          className="hidden lg:flex overflow-x-auto pb-1 gap-2 no-scrollbar sticky top-[64px] z-30 pt-2"
          style={{
            backgroundColor: "color-mix(in srgb, var(--bg) 95%, transparent)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {menus.map((menu) => (
            <button
              key={menu.id}
              onClick={() => setActiveMenuId(menu.id)}
              className="px-4 py-2 text-sm font-bold whitespace-nowrap rounded-t-lg transition-colors border-b-2 -mb-[1px]"
              style={{
                borderColor:
                  activeMenuId === menu.id ? "var(--primary)" : "transparent",
                color:
                  activeMenuId === menu.id
                    ? "var(--primary)"
                    : "var(--text-secondary)",
                backgroundColor:
                  activeMenuId === menu.id ? "var(--card)" : "transparent",
              }}
            >
              {menu.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8 relative items-start">
        {/* Desktop Sidebar Nav */}
        <aside className="hidden lg:block w-64 sticky top-32 shrink-0 max-h-[calc(100vh-8rem)] overflow-y-auto pr-4">
          <h3
            className="font-bold text-lg mb-4 px-2"
            style={{ color: "var(--text)" }}
          >
            Categories
          </h3>
          <nav className="space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className="w-full text-left px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  borderRadius: "var(--radius)",
                  backgroundColor:
                    activeCategory === cat.id ? "var(--card)" : "transparent",
                  color:
                    activeCategory === cat.id
                      ? "var(--primary)"
                      : "var(--text-secondary)",
                  borderLeft:
                    activeCategory === cat.id
                      ? "4px solid var(--primary)"
                      : "4px solid transparent",
                  boxShadow:
                    activeCategory === cat.id
                      ? "0 1px 3px rgba(0,0,0,0.08)"
                      : "none",
                }}
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
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {categories.map((category) => (
                <section
                  key={category.id}
                  id={`category-${category.id}`}
                  className="scroll-mt-32 mb-12"
                >
                  <div className="mb-6 flex items-center gap-3">
                    <div
                      className="w-1 h-7 rounded-full"
                      style={{ backgroundColor: "var(--primary)" }}
                    />
                    <h2
                      className="text-2xl font-bold tracking-tight"
                      style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
                    >
                      {category.name}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      onClick={onClick}
      className="group overflow-hidden flex flex-row cursor-pointer min-h-[140px] transition-all duration-300"
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
        <div>
          <h4
            className="font-bold text-base mb-1.5 leading-tight line-clamp-2 group-hover:text-[var(--primary)] transition-colors duration-200"
            style={{ color: "var(--text)" }}
          >
            {item.name}
          </h4>
          {item.description && (
            <p
              className="text-sm line-clamp-2 leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {item.description}
            </p>
          )}
        </div>
        <div className="mt-3">
          <span
            className="font-bold text-base"
            style={{ color: "var(--primary)" }}
          >
            ${item.price.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="w-32 sm:w-36 shrink-0 relative">
        {item.image ? (
          <div
            className="h-full w-full relative overflow-hidden"
            style={{ backgroundColor: "var(--border)" }}
          >
            <img
              src={item.image}
              alt={item.name}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
            <div className="absolute bottom-2 right-2">
              <button
                className="rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all duration-200 group-hover:scale-110"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-text)",
                }}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div
            className="h-full w-full flex items-center justify-center relative"
            style={{
              background:
                "linear-gradient(135deg, var(--card) 0%, var(--border) 100%)",
            }}
          >
            <ImageIcon
              className="h-8 w-8 opacity-30"
              style={{ color: "var(--text-secondary)" }}
            />
            <div className="absolute bottom-2 right-2">
              <button
                className="rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-all duration-200 group-hover:scale-110"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-text)",
                }}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
