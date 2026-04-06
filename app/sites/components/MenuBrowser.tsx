"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import {
  StorefrontMenu,
  StorefrontItem,
  StorefrontCategory,
} from "@/types/storefront";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Search,
  X,
  ImageIcon,
  Flame,
  Coffee,
  Sandwich,
  ShoppingBag,
  Croissant,
  UtensilsCrossed,
  Wine,
  Beer,
  Sun,
  Moon,
  LayoutList,
  Smile,
  Star,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useCart } from "../hooks/useCart";
import { ItemDetailsModal } from "./ItemDetailsModal";

const DIETARY_OPTIONS = ["Vegan", "Vegetarian", "Gluten-Free", "Dairy-Free", "Keto"] as const;

const CATEGORY_ICON_MAP: { keywords: string[]; icon: LucideIcon }[] = [
  { keywords: ["espresso", "coffee", "drip", "latte", "cappuccino", "americano"], icon: Coffee },
  { keywords: ["bakery", "pastry", "croissant", "bread", "muffin", "donut", "cake"], icon: Croissant },
  { keywords: ["sandwich", "breakfast", "burger", "wrap", "panini"], icon: Sandwich },
  { keywords: ["merchandise", "shop", "retail", "gift", "swag"], icon: ShoppingBag },
  { keywords: ["uptown happy hour", "uptown"], icon: Smile },
  { keywords: ["happy hour", "bar", "beer", "cocktail", "drinks"], icon: Beer },
  { keywords: ["wine", "vineyard"], icon: Wine },
  { keywords: ["brunch", "morning", "summer"], icon: Sun },
  { keywords: ["late night", "night", "special"], icon: Moon },
  { keywords: ["lunch", "dinner", "meal", "food", "salad", "soup"], icon: UtensilsCrossed },
  { keywords: ["standard", "default", "regular"], icon: LayoutList },
];

function getCategoryIcon(name: string): LucideIcon {
  const lower = name.toLowerCase();
  for (const { keywords, icon } of CATEGORY_ICON_MAP) {
    if (keywords.some((k) => lower.includes(k))) return icon;
  }
  return LayoutList;
}
type DietaryFilter = (typeof DIETARY_OPTIONS)[number];

export type MenuLayout = "cards" | "sidebyside" | "no-images";

interface MenuBrowserProps {
  menus: StorefrontMenu[];
  menuLayout?: MenuLayout;
  templateId?: "classic" | "bold" | "minimal";
}

function isValidImageSrc(src?: string | null): boolean {
  return !!src && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/"));
}

function flattenItems(menus: StorefrontMenu[]): StorefrontItem[] {
  const seen = new Map<string, StorefrontItem>();
  menus.forEach((menu) =>
    menu.categories?.forEach((cat) =>
      cat.items?.forEach((i) => {
        if (!seen.has(i.id)) seen.set(i.id, i);
      })
    )
  );
  return Array.from(seen.values());
}

export function MenuBrowser({
  menus,
  menuLayout = "cards",
  templateId = "classic",
}: MenuBrowserProps) {
  const [activeMenuId, setActiveMenuId] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<StorefrontItem | null>(null);
  const [selectedCategoryItems, setSelectedCategoryItems] = useState<StorefrontItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [dietaryFilter, setDietaryFilter] = useState<DietaryFilter | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<StorefrontItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [navHeight, setNavHeight] = useState(56);
  const [headerHeight, setHeaderHeight] = useState(56);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const desktopSuggestionsRef = useRef<HTMLDivElement>(null);
  const isBoldTemplate = templateId === "bold";
  const isMinimalTemplate = templateId === "minimal";

  const { pendingModalItem, clearPendingModalItem } = useCart();

  useEffect(() => {
    const updateNavHeight = () => {
      const nav = document.getElementById("sticky-category-nav");
      if (nav) setNavHeight(nav.offsetHeight);
    };
    updateNavHeight();
    const nav = document.getElementById("sticky-category-nav");
    if (!nav) return;
    const ro = new ResizeObserver(updateNavHeight);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [activeMenuId]);

  useEffect(() => {
    const updateHeaderHeight = () => {
      const header = document.getElementById("storefront-header");
      if (header) setHeaderHeight(header.offsetHeight);
    };
    updateHeaderHeight();
    const header = document.getElementById("storefront-header");
    if (!header) return;
    const ro = new ResizeObserver(updateHeaderHeight);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);



  const handleImageError = useCallback((itemId: string) => {
    setFailedImageIds((prev) => new Set(prev).add(itemId));
  }, []);

  useEffect(() => {
    if (menus.length > 0 && !activeMenuId) {
      setActiveMenuId(menus[0].id);
    }
  }, [menus, activeMenuId]);

  const activeMenu = menus.find((m) => m.id === activeMenuId);

  useEffect(() => {
    if (activeMenu?.categories?.length) {
      const firstId = activeMenu.categories[0].id;
      setActiveCategory(firstId);
    }
  }, [activeMenu]);

  const allItems = useMemo(() => flattenItems(menus), [menus]);

  // Predictive search — ranked by relevance, description only for longer queries
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) {
      setSearchSuggestions([]);
      return;
    }
    const nameStartsWith: StorefrontItem[] = [];
    const nameContains: StorefrontItem[] = [];
    const descContains: StorefrontItem[] = [];
    for (const i of allItems) {
      const name = i.name.toLowerCase();
      if (name.startsWith(q)) {
        nameStartsWith.push(i);
      } else if (name.includes(q)) {
        nameContains.push(i);
      } else if (q.length >= 3 && i.description?.toLowerCase().includes(q)) {
        descContains.push(i);
      }
    }
    setSearchSuggestions(
      [...nameStartsWith, ...nameContains, ...descContains].slice(0, 6)
    );
  }, [searchQuery, allItems]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const inMobile = suggestionsRef.current?.contains(e.target as Node);
      const inDesktop = desktopSuggestionsRef.current?.contains(e.target as Node);
      if (!inMobile && !inDesktop) {
        setShowSuggestions(false);
        setIsSearchOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  const handleItemClick = useCallback((item: StorefrontItem) => {
    setSelectedItem(item);
    // Find the category items for "You might also like" upsell
    let catItems: StorefrontItem[] = [];
    for (const menu of menus) {
      for (const cat of menu.categories) {
        if (cat.items.some((i) => i.id === item.id)) {
          catItems = cat.items;
          break;
        }
      }
      if (catItems.length) break;
    }
    setSelectedCategoryItems(catItems);
    setIsModalOpen(true);
  }, [menus]);

  // Open modal when CartSidebar upsell requests it via the cart store
  useEffect(() => {
    if (pendingModalItem) {
      handleItemClick(pendingModalItem);
      clearPendingModalItem();
    }
  }, [pendingModalItem, handleItemClick, clearPendingModalItem]);

  const scrollToCategory = (categoryId: string) => {
    setActiveCategory(categoryId);
    const element = document.getElementById(`category-${categoryId}`);
    if (element) {
        const offset = headerHeight + navHeight + 8;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({ top: offsetPosition, behavior: "smooth" });
    }
  };

  const itemMatchesDietary = (item: StorefrontItem, filter: DietaryFilter): boolean => {
    const tags = (item.dietary_tags || []).map((t) => t.toLowerCase());
    const normalized = filter.toLowerCase().replace(/-/g, " ");
    return tags.some((t) => t.includes(normalized) || normalized.includes(t));
  };

  const itemMatchesSearch = (item: StorefrontItem, query: string): boolean => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.description?.toLowerCase().includes(q) ?? false)
    );
  };

  const filteredCategories = useMemo(() => {
    if (!activeMenu?.categories) return [];
    const query = searchQuery.trim();
    const dietary = dietaryFilter;

    return activeMenu.categories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => {
          if (dietary && !itemMatchesDietary(item, dietary)) return false;
          if (query && !itemMatchesSearch(item, query)) return false;
          return true;
        }),
      }))
      .filter((category) => category.items.length > 0);
  }, [activeMenu?.categories, searchQuery, dietaryFilter]);

  // Scroll spy: update active category when scrolling through sections
  useEffect(() => {
    const cats = searchQuery.trim() || dietaryFilter ? filteredCategories : (activeMenu?.categories ?? []);
    if (cats.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = e.target.getAttribute("id")?.replace("category-", "");
            if (id) setActiveCategory(id);
          }
        }
      },
      { rootMargin: `-${headerHeight + navHeight + 8}px 0px -50% 0px`, threshold: 0 }
    );
    cats.forEach((c) => {
      const el = document.getElementById(`category-${c.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [filteredCategories, activeMenu?.categories, searchQuery, dietaryFilter, navHeight, headerHeight]);

  // Popular items shown in "Most Ordered" strip — only when no filter is active
  // Must be declared before any early returns (Rules of Hooks)
  const popularItems = useMemo(() => {
    if (!activeMenu || searchQuery.trim() || dietaryFilter) return [];
    const seen = new Set<string>();
    return activeMenu.categories
      .flatMap((c) => c.items)
      .filter((i) => {
        if (!i.is_popular || i.availability === false || seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      });
  }, [activeMenu, searchQuery, dietaryFilter]);

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

  // Apply both search and dietary filters to the category pills
  const categories = (searchQuery.trim() || dietaryFilter)
    ? filteredCategories
    : activeMenu.categories;

  return (
    <div className="space-y-6 min-w-0">
      <ItemDetailsModal
        item={selectedItem}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        categoryItems={selectedCategoryItems}
        onItemSelect={handleItemClick}
      />

      {/* Unified sticky nav: desktop = tabs + search in one row; mobile = stacked */}
      <div
        id="sticky-category-nav"
        className={`${searchQuery ? "sticky" : ""} lg:sticky z-40 -mx-4 px-4`}
        style={{
          top: headerHeight,
          backgroundColor: "var(--bg)",
          borderBottom: isBoldTemplate ? "1px solid rgba(255,255,255,0.12)" : "1px solid var(--border)",
        }}
      >
        {/* Desktop row: menu tabs (left) + search (right) — hidden on mobile */}
        <div className="hidden lg:flex items-center gap-3 py-2">
          {menus.length > 1 && (
            <div className="flex overflow-x-auto no-scrollbar gap-2 flex-1">
              {menus.map((menu) => {
                const Icon = getCategoryIcon(menu.name);
                const isActive = activeMenuId === menu.id;
                return (
                  <button
                    key={menu.id}
                    onClick={() => setActiveMenuId(menu.id)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold whitespace-nowrap rounded-t-lg transition-colors border-b-2 -mb-[1px] shrink-0"
                    style={{
                      borderColor: isActive ? "var(--primary)" : "transparent",
                      color: isActive ? "var(--primary)" : "var(--text-secondary)",
                      backgroundColor: isActive ? "var(--card)" : "transparent",
                    }}
                  >
                    <Icon style={{ width: 16, height: 16, opacity: isActive ? 1 : 0.8 }} />
                    {menu.name.toUpperCase()}
                  </button>
                );
              })}
            </div>
          )}

          {/* Desktop search bar */}
          <div className="relative shrink-0" ref={desktopSuggestionsRef}>
            <AnimatePresence>
              {isSearchOpen ? (
                <motion.div
                  initial={{ opacity: 0, width: 48 }}
                  animate={{ opacity: 1, width: 280 }}
                  exit={{ opacity: 0, width: 48 }}
                  className="relative"
                >
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                    style={{ color: "var(--text-secondary)" }}
                  />
                  <Input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search menu..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => searchQuery.trim().length >= 2 && setShowSuggestions(true)}
                    className="pl-10 pr-10 h-9"
                    style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(""); setShowSuggestions(false); setIsSearchOpen(false); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  {showSuggestions && searchSuggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute top-full right-0 mt-1 z-[100] rounded-lg shadow-xl overflow-hidden"
                      style={{
                        width: 320,
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
                      }}
                    >
                      {searchSuggestions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors min-h-[44px]"
                          style={{ backgroundColor: "var(--card)", color: "var(--text)", borderBottom: "1px solid var(--border)" }}
                          onClick={() => { handleItemClick(item); setShowSuggestions(false); }}
                        >
                          {(isValidImageSrc(item.image) && !failedImageIds.has(item.id)) ? (
                            <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 relative" style={{ backgroundColor: "var(--border)" }}>
                              <Image src={item.image!} fill alt="" className="object-cover" sizes="40px" onError={() => handleImageError(item.id)} />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-md shrink-0 flex items-center justify-center text-sm font-semibold" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 15%, var(--bg))", color: "var(--primary)" }}>
                              {item.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="font-medium truncate block" style={{ color: "var(--text)" }}>{item.name}</span>
                            {item.description && <span className="text-xs truncate block" style={{ color: "var(--text-secondary)" }}>{item.description}</span>}
                          </div>
                          <span className="font-semibold shrink-0" style={{ color: "var(--text)" }}>${item.price.toFixed(2)}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              ) : (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  className="flex items-center gap-2 px-3 h-9 text-sm rounded-lg transition-colors min-w-[44px]"
                  style={{ backgroundColor: "color-mix(in srgb, var(--text) 6%, transparent)", color: "var(--text-secondary)" }}
                >
                  <Search className="h-4 w-4 shrink-0" />
                  <span>Search</span>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Mobile rows (hidden on desktop) */}
        <div className="lg:hidden py-3 space-y-3">
          {/* Mobile search bar */}
          <div className="relative" ref={suggestionsRef}>
            <AnimatePresence>
              {isSearchOpen ? (
                <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "100%" }} exit={{ opacity: 0, width: 0 }} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "var(--text-secondary)" }} />
                    <Input
                      type="text"
                      placeholder="Search menu... e.g. Americano"
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => searchQuery.trim().length >= 2 && setShowSuggestions(true)}
                      className="pl-10 pr-10 h-12 min-h-[44px]"
                      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
                      autoFocus
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => { setSearchQuery(""); setShowSuggestions(false); setIsSearchOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center -m-2" style={{ color: "var(--text-secondary)" }}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {showSuggestions && searchSuggestions.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="absolute top-full left-0 right-0 mt-1 z-[100] rounded-lg shadow-xl overflow-hidden" style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 10px 40px rgba(0,0,0,0.18)" }}>
                        {searchSuggestions.map((item) => (
                          <button key={item.id} type="button" className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors min-h-[44px]" style={{ backgroundColor: "var(--card)", color: "var(--text)", borderBottom: "1px solid var(--border)" }} onClick={() => { handleItemClick(item); setShowSuggestions(false); }}>
                            {(isValidImageSrc(item.image) && !failedImageIds.has(item.id)) ? (
                              <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 relative flex-shrink-0" style={{ backgroundColor: "var(--border)" }}>
                                <Image src={item.image!} fill alt="" className="object-cover" sizes="40px" onError={() => handleImageError(item.id)} />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-md shrink-0 flex items-center justify-center text-sm font-semibold" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 15%, var(--bg))", color: "var(--primary)" }}>
                                {item.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="font-medium truncate block" style={{ color: "var(--text)" }}>{item.name}</span>
                              {item.description && <span className="text-xs truncate block" style={{ color: "var(--text-secondary)" }}>{item.description}</span>}
                            </div>
                            <span className="font-semibold shrink-0" style={{ color: "var(--text)" }}>${item.price.toFixed(2)}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
                  <button type="button" onClick={() => setIsSearchOpen(true)} className="w-full flex items-center gap-3 px-4 h-11 text-sm rounded-xl transition-colors text-left min-h-[44px]" style={{ backgroundColor: "color-mix(in srgb, var(--text) 6%, transparent)", color: "var(--text-secondary)" }}>
                    <Search className="h-4 w-4 shrink-0" style={{ color: "var(--text-secondary)" }} />
                    <span>Search menu... e.g. Americano</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Dietary filter chips */}
          {allItems.some((i) => (i.dietary_tags?.length ?? 0) > 0) && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs font-medium self-center" style={{ color: "var(--text-secondary)" }}>Filter:</span>
              {DIETARY_OPTIONS.map((opt) => {
                const hasMatches = allItems.some((i) => itemMatchesDietary(i, opt));
                if (!hasMatches) return null;
                const isActive = dietaryFilter === opt;
                return (
                  <button key={opt} type="button" onClick={() => setDietaryFilter(isActive ? null : opt)} className="px-3 py-1.5 text-xs font-medium rounded-full transition-all min-h-[36px] touch-manipulation" style={{ backgroundColor: isActive ? "var(--primary)" : "var(--card)", color: isActive ? "var(--primary-text)" : "var(--text-secondary)", border: `1px solid ${isActive ? "var(--primary)" : "var(--border)"}` }}>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {/* Mobile menu tabs */}
          {menus.length > 1 && (
            <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1">
              {menus.map((menu) => {
                const Icon = getCategoryIcon(menu.name);
                const isActive = activeMenuId === menu.id;
                return (
                  <button key={menu.id} onClick={() => setActiveMenuId(menu.id)} className="flex items-center gap-2 px-4 py-2 text-sm font-bold whitespace-nowrap rounded-t-lg transition-colors border-b-2 -mb-[1px] shrink-0" style={{ borderColor: isActive ? "var(--primary)" : "transparent", color: isActive ? "var(--primary)" : "var(--text-secondary)", backgroundColor: isActive ? "var(--card)" : "transparent" }}>
                    <Icon style={{ width: 16, height: 16, opacity: isActive ? 1 : 0.8 }} />
                    {menu.name.toUpperCase()}
                  </button>
                );
              })}
            </div>
          )}

          {/* Category pills — mobile */}
          <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1">
            {categories.map((cat) => {
              const availableCount = cat.items.filter((i) => i.availability !== false).length;
              const Icon = getCategoryIcon(cat.name);
              const isActive = activeCategory === cat.id;
              if (isBoldTemplate) {
                return (
                  <button key={cat.id} onClick={() => scrollToCategory(cat.id)} className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold whitespace-nowrap transition-all duration-200 shrink-0 rounded-full" style={{ backgroundColor: isActive ? "var(--primary)" : "color-mix(in srgb, var(--card) 80%, transparent)", color: isActive ? "var(--primary-text)" : "var(--text-secondary)", border: `1px solid ${isActive ? "var(--primary)" : "var(--border)"}`, boxShadow: isActive ? "0 0 16px color-mix(in srgb, var(--primary) 45%, transparent)" : "none" }}>
                    <span className="flex items-center justify-center w-5 h-5 rounded-full shrink-0 transition-all duration-200" style={{ backgroundColor: isActive ? "color-mix(in srgb, var(--primary-text) 18%, transparent)" : "color-mix(in srgb, var(--primary) 22%, transparent)", color: isActive ? "var(--primary-text)" : "var(--primary)" }}>
                      <Icon style={{ width: 12, height: 12 }} />
                    </span>
                    {cat.name}
                    <span className="text-[10px] opacity-70">·{availableCount}</span>
                  </button>
                );
              }
              return (
                <button key={cat.id} onClick={() => scrollToCategory(cat.id)} className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-200 shrink-0" style={{ borderRadius: "var(--radius)", backgroundColor: isActive ? "var(--primary)" : "var(--card)", color: isActive ? "var(--primary-text)" : "var(--text-secondary)", border: `1px solid ${isActive ? "var(--primary)" : "var(--border)"}`, boxShadow: isActive ? "0 2px 8px color-mix(in srgb, var(--primary) 30%, transparent)" : "none" }}>
                  <Icon style={{ width: 14, height: 14, opacity: isActive ? 1 : 0.8 }} />
                  {cat.name}
                  <span className="text-[10px] opacity-60">·{availableCount}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop dietary chips + category pills (minimal shows pills at all sizes) */}
        <div className="hidden lg:block">
          {allItems.some((i) => (i.dietary_tags?.length ?? 0) > 0) && (
            <div className="flex flex-wrap gap-2 pb-2">
              <span className="text-xs font-medium self-center" style={{ color: "var(--text-secondary)" }}>Filter:</span>
              {DIETARY_OPTIONS.map((opt) => {
                const hasMatches = allItems.some((i) => itemMatchesDietary(i, opt));
                if (!hasMatches) return null;
                const isActive = dietaryFilter === opt;
                return (
                  <button key={opt} type="button" onClick={() => setDietaryFilter(isActive ? null : opt)} className="px-3 py-1.5 text-xs font-medium rounded-full transition-all min-h-[36px] touch-manipulation" style={{ backgroundColor: isActive ? "var(--primary)" : "var(--card)", color: isActive ? "var(--primary-text)" : "var(--text-secondary)", border: `1px solid ${isActive ? "var(--primary)" : "var(--border)"}` }}>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
          {isMinimalTemplate && (
            <div className="flex overflow-x-auto no-scrollbar gap-2 pb-2">
              {categories.map((cat) => {
                const availableCount = cat.items.filter((i) => i.availability !== false).length;
                const Icon = getCategoryIcon(cat.name);
                const isActive = activeCategory === cat.id;
                return (
                  <button key={cat.id} onClick={() => scrollToCategory(cat.id)} className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-200 shrink-0" style={{ borderRadius: "var(--radius)", backgroundColor: isActive ? "var(--primary)" : "var(--card)", color: isActive ? "var(--primary-text)" : "var(--text-secondary)", border: `1px solid ${isActive ? "var(--primary)" : "var(--border)"}`, boxShadow: isActive ? "0 2px 8px color-mix(in srgb, var(--primary) 30%, transparent)" : "none" }}>
                    <Icon style={{ width: 14, height: 14, opacity: isActive ? 1 : 0.8 }} />
                    {cat.name}
                    <span className="text-[10px] opacity-60">·{availableCount}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 relative items-start">
      {/* Desktop Sidebar Nav - classic and bold only, lg+ */}
      {!isMinimalTemplate && (
        <aside
          className="hidden lg:block w-64 shrink-0 lg:sticky self-start overflow-y-auto"
          style={{
            top: headerHeight + 12,
            maxHeight: `calc(100vh - ${headerHeight + 24}px)`,
            ...(isBoldTemplate ? {
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "12px 8px",
            } : {
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "12px 8px",
            }),
          }}
        >
          <h3
            className="font-bold text-lg mb-4 px-2"
            style={{ color: "var(--text)" }}
          >
            Categories
          </h3>
          <nav className="space-y-1">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              const Icon = getCategoryIcon(cat.name);
              return (
                <button
                  key={cat.id}
                  onClick={() => scrollToCategory(cat.id)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 hover:bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]"
                  style={{
                    backgroundColor: isActive
                      ? "color-mix(in srgb, var(--primary) 12%, var(--card))"
                      : "transparent",
                    color: isActive
                      ? "var(--primary)"
                      : "var(--text-secondary)",
                    borderLeft: isActive
                      ? "4px solid var(--primary)"
                      : "4px solid transparent",
                    fontWeight: isActive ? 600 : 500,
                    boxShadow: isActive
                      ? "0 1px 4px color-mix(in srgb, var(--primary) 25%, transparent)"
                      : "none",
                  }}
                >
                  <span
                    className="flex shrink-0 items-center justify-center w-8 h-8 rounded-lg"
                    style={{
                      backgroundColor: isActive
                        ? "color-mix(in srgb, var(--primary) 20%, transparent)"
                        : "color-mix(in srgb, var(--text-secondary) 15%, transparent)",
                    }}
                  >
                    <Icon
                      className={isActive ? "" : "opacity-70"}
                      style={{
                        color: "inherit",
                        width: 16,
                        height: 16,
                      }}
                    />
                  </span>
                  {cat.name}
                </button>
              );
            })}
          </nav>
        </aside>
      )}

        {/* Main Content */}
        <div className="flex-1 min-w-0 w-full space-y-12 pb-48 lg:pb-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMenu.id}
              initial={false}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="min-w-0"
            >
              {popularItems.length > 0 && !isMinimalTemplate && (
                <section className="mb-10 min-w-0">
                  <div className="flex items-center gap-2 mb-4">
                    <Flame className="h-5 w-5" style={{ color: "var(--primary)" }} />
                    <h2
                      className="text-xl font-bold"
                      style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
                    >
                      Most Ordered
                    </h2>
                  </div>
                  <div className="relative min-w-0">
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                      {popularItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleItemClick(item)}
                          className="shrink-0 w-28 sm:w-36 rounded-xl overflow-hidden text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                          style={{
                            backgroundColor: "var(--card)",
                            border: "1px solid var(--border)",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                          }}
                        >
                          <div
                            className="h-20 sm:h-24 w-full overflow-hidden flex items-center justify-center relative"
                            style={{
                              backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--bg))",
                            }}
                          >
                            {isValidImageSrc(item.image) && !failedImageIds.has(item.id) ? (
                              <Image
                                src={item.image!}
                                fill
                                alt={item.name}
                                className="object-cover"
                                sizes="(max-width: 640px) 112px, 144px"
                                onError={() => handleImageError(item.id)}
                              />
                            ) : (
                              <span
                                className="text-2xl font-bold opacity-40"
                                style={{ color: "var(--primary)" }}
                              >
                                {item.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="p-2 space-y-0.5">
                            <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: "var(--text)" }}>
                              {item.name}
                            </p>
                            <p className="text-xs font-bold" style={{ color: "var(--text)" }}>
                              ${item.price.toFixed(2)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                    {/* Right-fade scroll hint */}
                    <div
                      className="absolute right-0 top-0 bottom-2 w-8 pointer-events-none"
                      style={{
                        background: "linear-gradient(to right, transparent, var(--bg))",
                      }}
                    />
                  </div>
                </section>
              )}

              {categories.length === 0 && (searchQuery.trim() || dietaryFilter) && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div
                    className="rounded-full p-4 mb-4"
                    style={{ backgroundColor: "var(--card)" }}
                  >
                    <Search className="h-8 w-8" style={{ color: "var(--text-secondary)" }} />
                  </div>
                  <h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
                    No items found
                  </h3>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                    Try a different search or clear the filter
                  </p>
                </div>
              )}

              {categories.map((category) => (
                <section
                  key={category.id}
                  id={`category-${category.id}`}
                  className="scroll-mt-32 mb-12"
                >
                  {isBoldTemplate ? (
                    <>
                      {/* Editorial category heading */}
                      <div className="mb-5">
                        <h2
                          className="text-3xl sm:text-4xl font-extrabold tracking-tight"
                          style={{
                            color: "var(--text)",
                            fontFamily: "var(--font-display)",
                          }}
                        >
                          {category.name}
                        </h2>
                        <div
                          className="mt-2 h-[2px] w-10 rounded-full"
                          style={{ backgroundColor: "var(--primary)" }}
                        />
                      </div>

                      {/* Items grid — 2 columns for cards, 1 col on mobile for sidebyside/no-images */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-5">
                        {category.items.map((item) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            layout={menuLayout}
                            onClick={() => handleItemClick(item)}
                            variant="bold"
                            showBadges={!isMinimalTemplate || menuLayout === "cards"}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mb-6 flex items-center gap-3">
                        <div
                          className="w-1 h-7 rounded-full"
                          style={{ backgroundColor: "var(--primary)" }}
                        />
                        <h2
                          className="text-3xl font-extrabold tracking-tight"
                          style={{
                            color: "var(--text)",
                            fontFamily: "var(--font-display)",
                          }}
                        >
                          {category.name.toUpperCase()}
                        </h2>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-5">
                        {category.items.map((item) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            layout={menuLayout}
                            onClick={() => handleItemClick(item)}
                            showBadges={!isMinimalTemplate || menuLayout === "cards"}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </section>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}

const cardBaseStyles = {
  border: "1px solid var(--border)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const AddButton = ({
  item,
  onClick,
}: {
  item: StorefrontItem;
  onClick: () => void;
}) => (
  <button
    type="button"
    disabled={!item.availability}
    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all duration-200 group-hover:scale-110 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
    style={{
      backgroundColor: "var(--primary)",
      color: "var(--primary-text)",
      boxShadow: "0 2px 8px color-mix(in srgb, var(--primary) 40%, transparent)",
    }}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    aria-label={`Add ${item.name} to cart`}
  >
    <Plus className="h-5 w-5" />
  </button>
);

function ItemCard({
  item,
  layout,
  onClick,
  variant = "default",
  showBadges = true,
}: {
  item: StorefrontItem;
  layout: MenuLayout;
  onClick: () => void;
  variant?: "default" | "bold";
  showBadges?: boolean;
}) {
  const [imageError, setImageError] = useState(false);
  const showImage = layout !== "no-images" && isValidImageSrc(item.image) && !imageError;

  const handleEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)";
    e.currentTarget.style.transform = "translateY(-2px)";
  };
  const handleLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.boxShadow = cardBaseStyles.boxShadow;
    e.currentTarget.style.transform = "translateY(0)";
  };

  const isBoldCard = variant === "bold";

  // Layout: no-images — compact list style, no images
  if (layout === "no-images") {
    const isSoldOut = item.availability === false;
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        onClick={isSoldOut ? undefined : onClick}
        className={`group overflow-hidden flex flex-row items-center gap-4 p-4 rounded-xl transition-all duration-300 ${isSoldOut ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        style={{
          ...cardBaseStyles,
          backgroundColor: "var(--card)",
          border: isBoldCard ? "1px solid var(--border)" : cardBaseStyles.border,
        }}
        onMouseEnter={isSoldOut ? undefined : handleEnter}
        onMouseLeave={isSoldOut ? undefined : handleLeave}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <h4
              className="font-bold text-base leading-tight line-clamp-1 group-hover:text-[var(--primary)] transition-colors"
              style={{ color: "var(--text)" }}
            >
              {item.name}
            </h4>
            {showBadges && item.is_new && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
              >
                ✨ New
              </span>
            )}
            {showBadges && item.is_popular && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
              >
                🔥 Popular
              </span>
            )}
            {isSoldOut && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: "rgba(0,0,0,0.65)", color: "#ffffff" }}
              >
                Sold Out
              </span>
            )}
          </div>
          {item.description && (
              <p className="text-sm line-clamp-1 mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {item.description}
            </p>
          )}
        </div>
        <span className="font-bold shrink-0" style={{ color: "var(--text)" }}>
          ${item.price.toFixed(2)}
        </span>
        <AddButton item={item} onClick={onClick} />
      </motion.div>
    );
  }

  // Layout: sidebyside — content left, image right (horizontal card)
  if (layout === "sidebyside") {
    const isSoldOut = item.availability === false;
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        onClick={isSoldOut ? undefined : onClick}
        className={`group overflow-hidden flex flex-row min-h-[100px] sm:min-h-[130px] rounded-xl transition-all duration-300 ${isSoldOut ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        style={{
          ...cardBaseStyles,
          backgroundColor: "var(--card)",
          border: isBoldCard ? "1px solid var(--border)" : cardBaseStyles.border,
        }}
        onMouseEnter={isSoldOut ? undefined : handleEnter}
        onMouseLeave={isSoldOut ? undefined : handleLeave}
      >
        <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <h4
                className="font-bold text-base leading-tight line-clamp-1 group-hover:text-[var(--primary)] transition-colors"
                style={{ color: "var(--text)" }}
              >
                {item.name}
              </h4>
              {showBadges && item.is_new && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                >
                  ✨ New
                </span>
              )}
              {showBadges && item.is_popular && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                >
                  🔥 Popular
                </span>
              )}
            </div>
            {item.dietary_tags && item.dietary_tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {item.dietary_tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)",
                      color: "var(--primary)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {item.description && (
              <p
                className="text-sm line-clamp-2 leading-relaxed opacity-90"
                style={{ color: "var(--text-secondary)" }}
              >
                {item.description}
              </p>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="font-bold text-lg" style={{ color: "var(--text)" }}>
              ${item.price.toFixed(2)}
            </span>
            <AddButton item={item} onClick={onClick} />
          </div>
        </div>
        {showImage ? (
          <div className="w-24 sm:w-32 md:w-36 shrink-0 relative overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
            <Image
              src={item.image!}
              fill
              alt={item.name}
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes="144px"
              onError={() => setImageError(true)}
            />
            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
            {isSoldOut && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                <span className="text-white font-semibold text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(0,0,0,0.65)" }}>
                  Sold Out
                </span>
              </div>
            )}
          </div>
        ) : (
          <div
            className="w-24 sm:w-32 md:w-36 shrink-0 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, var(--card) 0%, var(--border) 100%)" }}
          >
            <span className="text-3xl font-bold" style={{ color: "var(--card-text)" }}>
              {item.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </motion.div>
    );
  }

  // Layout: cards — bold variant: editorial dark card, image on top (16:9), clean body below
  if (isBoldCard) {
    const isSoldOut = item.availability === false;
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        onClick={isSoldOut ? undefined : onClick}
        className={`group overflow-hidden flex flex-col rounded-2xl transition-all duration-300 ${isSoldOut ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
        }}
        onMouseEnter={isSoldOut ? undefined : (e) => {
          e.currentTarget.style.transform = "translateY(-4px)";
          e.currentTarget.style.borderColor = "var(--primary)";
        }}
        onMouseLeave={isSoldOut ? undefined : (e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.borderColor = "var(--border)";
        }}
      >
        {/* image — fixed height on mobile, 16:9 on sm+ */}
        <div
          className="w-full h-48 sm:h-auto sm:aspect-video relative overflow-hidden flex-shrink-0"
          style={{ backgroundColor: "var(--border)" }}
        >
          {showImage ? (
            <Image
              src={item.image!}
              fill
              alt={item.name}
              className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
              sizes="(max-width: 768px) 100vw, 50vw"
              onError={() => setImageError(true)}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, var(--card) 0%, color-mix(in srgb, var(--primary) 18%, var(--card)) 100%)",
              }}
            >
              <span
                className="text-7xl font-black select-none"
                style={{
                  color: "var(--primary)",
                  fontFamily: "var(--font-display)",
                  opacity: 0.25,
                }}
              >
                {item.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          {showBadges && (
            <div className="absolute top-2.5 right-2.5 z-10 flex flex-row items-center gap-1">
              {item.is_new && (
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                >
                  ✨ New
                </span>
              )}
              {item.is_popular && (
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                >
                  🔥 Popular
                </span>
              )}
            </div>
          )}
          {!item.availability && (
            <div
              className="absolute inset-0 flex items-center justify-center z-10"
              style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            >
              <span
                className="text-white font-bold text-sm px-3 py-1 rounded-full"
                style={{ backgroundColor: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.3)" }}
              >
                Sold Out
              </span>
            </div>
          )}
          {item.dietary_tags && item.dietary_tags.length > 0 && (
            <div className="absolute top-2.5 left-2.5 flex gap-1.5">
              {item.dietary_tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.7)",
                    color: "var(--primary)",
                    border:
                      "1px solid color-mix(in srgb, var(--primary) 40%, transparent)",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Card body */}
        <div className="p-3 sm:p-5 flex flex-col flex-1">
          <h4
            className="text-base sm:text-xl font-extrabold leading-tight line-clamp-2 mb-2 group-hover:text-[color:var(--primary)] transition-colors duration-200"
            style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
          >
            {item.name}
          </h4>
          {item.description && (
            <p
              className="text-sm line-clamp-2 flex-1 mb-3"
              style={{ color: "var(--text-secondary)" }}
            >
              {item.description}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 mt-auto">
            <span
              className="text-lg sm:text-xl font-black"
              style={{ color: "var(--text)" }}
            >
              ${item.price.toFixed(2)}
            </span>
            <AddButton item={item} onClick={onClick} />
          </div>
        </div>
      </motion.div>
    );
  }

  // Layout: cards — classic/minimal variant: image on top (4:3), white card body
  const isSoldOut = item.availability === false;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      onClick={isSoldOut ? undefined : onClick}
      className={`group overflow-hidden flex flex-col rounded-xl transition-all duration-300 ${isSoldOut ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      style={{
        backgroundColor: "var(--card)",
        border: cardBaseStyles.border,
        boxShadow: cardBaseStyles.boxShadow,
      }}
      onMouseEnter={isSoldOut ? undefined : (e) => {
        e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)";
        e.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={isSoldOut ? undefined : (e) => {
        e.currentTarget.style.boxShadow = cardBaseStyles.boxShadow;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        className="w-full h-48 sm:h-auto sm:aspect-[4/3] relative overflow-hidden"
        style={{ backgroundColor: "color-mix(in srgb, var(--primary) 8%, var(--bg))" }}
      >
        {showBadges && (
          <div className="absolute top-2 right-2 z-10 flex flex-row items-center gap-1">
            {item.is_new && (
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
              >
                ✨ New
              </span>
            )}
            {item.is_popular && (
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
              >
                🔥 Popular
              </span>
            )}
          </div>
        )}
        {!item.availability && (
          <div
            className="absolute inset-0 flex items-center justify-center z-10"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          >
            <span
              className="text-white font-bold text-sm px-3 py-1 rounded-full"
              style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
            >
              Sold Out
            </span>
          </div>
        )}
        {showImage ? (
          <>
            <Image
              src={item.image!}
              fill
              alt={item.name}
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes="(max-width: 768px) 100vw, 50vw"
              onError={() => setImageError(true)}
            />
            <div
              className="absolute inset-x-0 bottom-0 pointer-events-none"
              style={{
                height: "48px",
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.18) 0%, transparent 100%)",
              }}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 8%, var(--bg))" }}>
            <span className="text-4xl font-bold" style={{ color: "var(--primary)" }}>
              {item.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="p-3 sm:p-4 flex flex-col flex-1">
        <h4
          className="font-bold text-sm sm:text-base line-clamp-2 mb-1 leading-tight group-hover:text-[var(--primary)] transition-colors"
          style={{ color: "var(--text)" }}
        >
          {item.name}
        </h4>
        {item.dietary_tags && item.dietary_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {item.dietary_tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--primary) 15%, transparent)",
                  color: "var(--primary)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {item.description && (
          <p
            className="text-sm line-clamp-2 leading-relaxed mb-3 flex-1"
            style={{ color: "var(--text-secondary)" }}
          >
            {item.description}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <span
            className="text-base font-bold"
            style={{ color: "var(--text)" }}
          >
            ${item.price.toFixed(2)}
          </span>
          <AddButton item={item} onClick={onClick} />
        </div>
      </div>
    </motion.div>
  );
}
