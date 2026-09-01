"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import {
  StorefrontMenu,
  StorefrontItem,
} from "@/types/storefront";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Search,
  X,
  ImageIcon,
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
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useCart } from "../hooks/useCart";
import { ItemDetailsModal } from "./ItemDetailsModal";
import { useActiveItemAutoScroll } from "../hooks/useActiveItemAutoScroll";
import {
  getStorefrontBrowsePrice,
  getStorefrontDeliveryPriceLabel,
} from "../lib/storefront-pricing";

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
}: MenuBrowserProps) {
  const [activeMenuId, setActiveMenuId] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<StorefrontItem | null>(null);
  const [selectedCategoryItems, setSelectedCategoryItems] = useState<StorefrontItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dietaryFilter, setDietaryFilter] = useState<DietaryFilter | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<StorefrontItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [navHeight, setNavHeight] = useState(56);
  const [headerHeight, setHeaderHeight] = useState(56);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const desktopSuggestionsRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const mobilePillsRef = useRef<HTMLDivElement>(null);
  const desktopPillsRef = useRef<HTMLDivElement>(null);
  // While a pill click is smooth-scrolling, lock the highlight to the target so
  // the scroll-spy doesn't flicker through sections passed en route. Released
  // when the user next scrolls meaningfully away from where the scroll settles.
  const scrollLockRef = useRef<string | null>(null);
  const scrollLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollLockSettleYRef = useRef<number | null>(null);


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

  // Predictive search
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
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleItemClick = useCallback((item: StorefrontItem) => {
    setSelectedItem(item);
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
      // Lock the highlight to this target; released when the user next scrolls
      // meaningfully away from where this scroll settles (see scroll handler).
      scrollLockRef.current = categoryId;
      scrollLockSettleYRef.current = null;
      if (scrollLockTimerRef.current) clearTimeout(scrollLockTimerRef.current);
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

  useEffect(() => {
    const cats = searchQuery.trim() || dietaryFilter ? filteredCategories : (activeMenu?.categories ?? []);
    if (cats.length === 0) return;

    // Detection line just below the sticky header + category nav.
    const getBoundary = () => headerHeight + navHeight + 8;

    // Pick the last section whose top has scrolled above the boundary line —
    // i.e. the section currently filling the viewport. Deterministic and works
    // whether scrolling up or down (unlike an isIntersecting-only observer,
    // which never re-selects when scrolling back up).
    const updateActiveCategory = () => {
      // A click-lock wins over the scroll position until it's released, so the
      // clicked pill never flickers to a section passed during the smooth scroll.
      if (scrollLockRef.current) {
        setActiveCategory(scrollLockRef.current);
        return;
      }
      // Once scrolled to the bottom, force the last category — trailing sections
      // may be too short to ever push their top past the boundary line.
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      if (atBottom) {
        setActiveCategory(cats[cats.length - 1].id);
        return;
      }
      const boundary = getBoundary();
      // Highlight the section that owns the boundary line — its top is at/above
      // the line and its bottom is still below it. A section only becomes active
      // once the previous one has fully scrolled off the top (its bottom crosses
      // the line), rather than the moment its own heading appears.
      let current = cats[0].id;
      for (const c of cats) {
        const el = document.getElementById(`category-${c.id}`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top - boundary <= 1 && rect.bottom - boundary > 1) {
          current = c.id;
          break;
        }
        // Fallback for sub-viewport sections: keep advancing while tops are above
        // the line so we don't stall between two short sections.
        if (rect.top - boundary <= 1) current = c.id;
      }
      setActiveCategory(current);
    };

    updateActiveCategory();
    let ticking = false;
    const onScroll = () => {
      if (scrollLockRef.current) {
        if (scrollLockSettleYRef.current === null) {
          // Still animating toward the target: once it stops moving, record the
          // settle position rather than releasing (the target may sit at the page
          // bottom and never reach the boundary line).
          if (scrollLockTimerRef.current) clearTimeout(scrollLockTimerRef.current);
          scrollLockTimerRef.current = setTimeout(() => {
            scrollLockSettleYRef.current = window.scrollY;
          }, 120);
        } else if (Math.abs(window.scrollY - scrollLockSettleYRef.current) > 40) {
          // User scrolled away from the settled target — release the lock.
          scrollLockRef.current = null;
          scrollLockSettleYRef.current = null;
        }
      }
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateActiveCategory();
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (scrollLockTimerRef.current) clearTimeout(scrollLockTimerRef.current);
    };
  }, [filteredCategories, activeMenu?.categories, searchQuery, dietaryFilter, navHeight, headerHeight]);

  useActiveItemAutoScroll(mobileMenuRef, activeMenuId);
  useActiveItemAutoScroll(desktopMenuRef, activeMenuId);
  useActiveItemAutoScroll(mobilePillsRef, activeCategory);
  useActiveItemAutoScroll(desktopPillsRef, activeCategory);

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
        <div className="rounded-full p-4 mb-4" style={{ backgroundColor: "#F3F4F6" }}>
          <ImageIcon className="h-8 w-8" style={{ color: "#9CA3AF" }} />
        </div>
        <h3 className="text-xl font-semibold" style={{ color: "#111827" }}>
          No menus available
        </h3>
        <p className="mt-2" style={{ color: "#6B7280" }}>
          This location hasn&apos;t set up their online menu yet.
        </p>
      </div>
    );
  }

  const categories = (searchQuery.trim() || dietaryFilter)
    ? filteredCategories
    : activeMenu.categories;

  return (
    <main id="main-content" className="space-y-6 min-w-0">
      <ItemDetailsModal
        item={selectedItem}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        categoryItems={selectedCategoryItems}
        onItemSelect={handleItemClick}
      />

      {/* Sticky nav: menu tabs + search */}
      <nav
        id="sticky-category-nav"
        aria-label="Menu categories"
        className="sticky z-40 -mx-4 px-4"
        style={{
          top: headerHeight,
          backgroundColor: "#FFFFFF",
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        {/* Desktop row */}
        <div className="hidden lg:flex items-center gap-3 py-2">
          {menus.length > 1 && (
            <div ref={desktopMenuRef} className="flex overflow-x-auto no-scrollbar gap-1 flex-1">
              {menus.map((menu) => {
                const isActive = activeMenuId === menu.id;
                return (
                  <button
                    key={menu.id}
                    data-auto-scroll-id={menu.id}
                    onClick={() => setActiveMenuId(menu.id)}
                    className="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-[1px] shrink-0"
                    style={{
                      borderColor: isActive ? "var(--primary)" : "transparent",
                      color: isActive ? "var(--primary)" : "#6B7280",
                      backgroundColor: "transparent",
                    }}
                  >
                    {menu.name.toUpperCase()}
                  </button>
                );
              })}
            </div>
          )}

          {/* Desktop search — always visible */}
          <div className="relative shrink-0 w-56" ref={desktopSuggestionsRef}>
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
              style={{ color: "#9CA3AF" }}
            />
            <Input
              type="text"
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => searchQuery.trim().length >= 2 && setShowSuggestions(true)}
              className="pl-10 pr-8 h-9"
              style={{ backgroundColor: "#F9FAFB", borderColor: "#E5E7EB", color: "#111827" }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setShowSuggestions(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "#9CA3AF" }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {showSuggestions && searchSuggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-full right-0 mt-1 z-[100] rounded-lg overflow-hidden"
                style={{
                  width: 320,
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #E5E7EB",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                }}
              >
                {searchSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors min-h-[44px] hover:bg-gray-50"
                    style={{ color: "#111827", borderBottom: "1px solid #F3F4F6" }}
                    onClick={() => { handleItemClick(item); setShowSuggestions(false); }}
                  >
                    {(isValidImageSrc(item.image) && !failedImageIds.has(item.id)) ? (
                      <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 relative" style={{ backgroundColor: "#F3F4F6" }}>
                        <Image src={item.image!} fill alt="" className="object-cover" sizes="40px" onError={() => handleImageError(item.id)} />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-md shrink-0 flex items-center justify-center text-sm font-semibold" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, #FFFFFF)", color: "var(--primary)" }}>
                        {item.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block" style={{ color: "#111827" }}>{item.name}</span>
                      {item.description && <span className="text-xs truncate block" style={{ color: "#6B7280" }}>{item.description}</span>}
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-semibold text-sm" style={{ color: "#111827" }}>${getStorefrontBrowsePrice(item).toFixed(2)}</span>
                      {getStorefrontDeliveryPriceLabel(item) && (
                        <span className="text-[10px]" style={{ color: "#6B7280" }}>
                          {getStorefrontDeliveryPriceLabel(item)}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        </div>

        {/* Mobile rows */}
        <div className="lg:hidden py-3 space-y-3">
          {/* Mobile search */}
          <div className="relative" ref={suggestionsRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "#9CA3AF" }} />
            <Input
              type="text"
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => searchQuery.trim().length >= 2 && setShowSuggestions(true)}
              className="pl-10 pr-10 h-11 min-h-[44px] w-full"
              style={{ backgroundColor: "#F9FAFB", borderColor: "#E5E7EB", color: "#111827" }}
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(""); setShowSuggestions(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center -m-2" style={{ color: "#9CA3AF" }}>
                <X className="h-4 w-4" />
              </button>
            )}
            {showSuggestions && searchSuggestions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="absolute top-full left-0 right-0 mt-1 z-[100] rounded-lg overflow-hidden" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}>
                {searchSuggestions.map((item) => (
                  <button key={item.id} type="button" className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors min-h-[44px] hover:bg-gray-50" style={{ color: "#111827", borderBottom: "1px solid #F3F4F6" }} onClick={() => { handleItemClick(item); setShowSuggestions(false); }}>
                    {(isValidImageSrc(item.image) && !failedImageIds.has(item.id)) ? (
                      <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 relative" style={{ backgroundColor: "#F3F4F6" }}>
                        <Image src={item.image!} fill alt="" className="object-cover" sizes="40px" onError={() => handleImageError(item.id)} />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-md shrink-0 flex items-center justify-center text-sm font-semibold" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, #FFFFFF)", color: "var(--primary)" }}>
                        {item.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block" style={{ color: "#111827" }}>{item.name}</span>
                      {item.description && <span className="text-xs truncate block" style={{ color: "#6B7280" }}>{item.description}</span>}
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-semibold text-sm" style={{ color: "#111827" }}>${getStorefrontBrowsePrice(item).toFixed(2)}</span>
                      {getStorefrontDeliveryPriceLabel(item) && (
                        <span className="text-[10px]" style={{ color: "#6B7280" }}>
                          {getStorefrontDeliveryPriceLabel(item)}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          {/* Dietary filter chips */}
          {allItems.some((i) => (i.dietary_tags?.length ?? 0) > 0) && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs font-medium self-center" style={{ color: "#6B7280" }}>Filter:</span>
              {DIETARY_OPTIONS.map((opt) => {
                const hasMatches = allItems.some((i) => itemMatchesDietary(i, opt));
                if (!hasMatches) return null;
                const isActive = dietaryFilter === opt;
                return (
                  <button key={opt} type="button" onClick={() => setDietaryFilter(isActive ? null : opt)} className="px-3 py-1.5 text-xs font-medium rounded-full transition-all min-h-[36px] touch-manipulation" style={{ backgroundColor: isActive ? "var(--primary)" : "#FFFFFF", color: isActive ? "var(--primary-text)" : "#6B7280", border: `1px solid ${isActive ? "var(--primary)" : "#E5E7EB"}` }}>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {/* Mobile menu tabs */}
          {menus.length > 1 && (
            <div ref={mobileMenuRef} className="flex overflow-x-auto no-scrollbar gap-1 pb-1">
              {menus.map((menu) => {
                const isActive = activeMenuId === menu.id;
                return (
                  <button key={menu.id} data-auto-scroll-id={menu.id} onClick={() => setActiveMenuId(menu.id)} className="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-[1px] shrink-0" style={{ borderColor: isActive ? "var(--primary)" : "transparent", color: isActive ? "var(--primary)" : "#6B7280", backgroundColor: "transparent" }}>
                    {menu.name.toUpperCase()}
                  </button>
                );
              })}
            </div>
          )}

          {/* Category pills — mobile */}
          <div ref={mobilePillsRef} className="flex overflow-x-auto no-scrollbar gap-2 pb-1">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button key={cat.id} data-auto-scroll-id={cat.id} onClick={() => scrollToCategory(cat.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 rounded-full" style={{ backgroundColor: isActive ? "var(--primary)" : "#FFFFFF", color: isActive ? "#FFFFFF" : "#6B7280", border: `1px solid ${isActive ? "var(--primary)" : "#E5E7EB"}` }}>
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop dietary chips + category pills */}
        <div className="hidden lg:block">
          {allItems.some((i) => (i.dietary_tags?.length ?? 0) > 0) && (
            <div className="flex flex-wrap gap-2 pb-2">
              <span className="text-xs font-medium self-center" style={{ color: "#6B7280" }}>Filter:</span>
              {DIETARY_OPTIONS.map((opt) => {
                const hasMatches = allItems.some((i) => itemMatchesDietary(i, opt));
                if (!hasMatches) return null;
                const isActive = dietaryFilter === opt;
                return (
                  <button key={opt} type="button" onClick={() => setDietaryFilter(isActive ? null : opt)} className="px-3 py-1.5 text-xs font-medium rounded-full transition-all min-h-[36px] touch-manipulation" style={{ backgroundColor: isActive ? "var(--primary)" : "#FFFFFF", color: isActive ? "var(--primary-text)" : "#6B7280", border: `1px solid ${isActive ? "var(--primary)" : "#E5E7EB"}` }}>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
          <div ref={desktopPillsRef} className="flex overflow-x-auto no-scrollbar gap-2 pb-2">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button key={cat.id} data-auto-scroll-id={cat.id} onClick={() => scrollToCategory(cat.id)} className="px-3.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 rounded-full" style={{ backgroundColor: isActive ? "var(--primary)" : "#FFFFFF", color: isActive ? "#FFFFFF" : "#6B7280", border: `1px solid ${isActive ? "var(--primary)" : "#E5E7EB"}` }}>
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="min-w-0 w-full space-y-12 pb-24 lg:pb-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMenu.id}
              initial={false}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="min-w-0"
            >
              {/* Most Ordered strip */}
              {popularItems.length > 0 && (
                <section className="mb-10 min-w-0">
                  <div className="mb-1">
                    <h2 className="text-lg font-semibold" style={{ color: "var(--primary)", fontFamily: "var(--font-display)" }}>
                      Most Ordered
                    </h2>
                    <div className="mt-1 h-0.5 w-8 rounded-full" style={{ backgroundColor: "var(--primary)" }} />
                  </div>
                  <div className="relative min-w-0 mt-3">
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                      {popularItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleItemClick(item)}
                          className="shrink-0 w-28 sm:w-32 rounded-xl overflow-hidden text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                          style={{
                            backgroundColor: "#FFFFFF",
                            border: "1px solid #E5E7EB",
                          }}
                        >
                          <div className="h-20 sm:h-20 w-full overflow-hidden flex items-center justify-center relative" style={{ backgroundColor: "#F3F4F6" }}>
                            {isValidImageSrc(item.image) && !failedImageIds.has(item.id) ? (
                              <Image
                                src={item.image!}
                                fill
                                alt={item.name}
                                className="object-cover"
                                sizes="(max-width: 640px) 112px, 128px"
                                onError={() => handleImageError(item.id)}
                              />
                            ) : (
                              <span className="text-xl font-bold" style={{ color: "var(--primary)", opacity: 0.5 }}>
                                {item.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="p-2 space-y-0.5">
                            <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: "#111827" }}>
                              {item.name}
                            </p>
                            <div className="space-y-0.5">
                              <p className="text-xs font-semibold" style={{ color: "#6B7280" }}>
                                ${getStorefrontBrowsePrice(item).toFixed(2)}
                              </p>
                              {getStorefrontDeliveryPriceLabel(item) && (
                                <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                                  {getStorefrontDeliveryPriceLabel(item)}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="absolute right-0 top-0 bottom-2 w-8 pointer-events-none" style={{ background: "linear-gradient(to right, transparent, #FFFFFF)" }} />
                  </div>
                </section>
              )}

              {categories.length === 0 && (searchQuery.trim() || dietaryFilter) && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="rounded-full p-4 mb-4" style={{ backgroundColor: "#F3F4F6" }}>
                    <Search className="h-8 w-8" style={{ color: "#9CA3AF" }} />
                  </div>
                  <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>No items found</h3>
                  <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Try a different search or clear the filter</p>
                </div>
              )}

              {categories.map((category) => (
                <section key={category.id} id={`category-${category.id}`} className="scroll-mt-32 mb-12">
                  {/* Category heading */}
                  <div className="mb-5">
                    <h2
                      className="text-2xl font-bold"
                      style={{ color: "var(--primary)", fontFamily: "var(--font-display)" }}
                    >
                      {category.name}
                    </h2>
                    <div className="mt-1.5 h-0.5 w-8 rounded-full" style={{ backgroundColor: "var(--primary)" }} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    {category.items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        layout={menuLayout}
                        onClick={() => handleItemClick(item)}
                        showBadges={true}
                        failedImageIds={failedImageIds}
                        onImageError={handleImageError}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
    </main>
  );
}

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
    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full transition-all duration-200 group-hover:scale-110 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
    style={{
      backgroundColor: "var(--primary)",
      color: "var(--primary-text)",
    }}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    aria-label={`Add ${item.name} to cart`}
  >
    <Plus className="h-4 w-4" />
  </button>
);

function ItemCard({
  item,
  layout,
  onClick,
  showBadges = true,
  failedImageIds,
  onImageError,
}: {
  item: StorefrontItem;
  layout: MenuLayout;
  onClick: () => void;
  showBadges?: boolean;
  failedImageIds: Set<string>;
  onImageError: (id: string) => void;
}) {
  const [imageError, setImageError] = useState(false);
  const handleImageError = () => {
    setImageError(true);
    onImageError(item.id);
  };
  const showImage = layout !== "no-images" && isValidImageSrc(item.image) && !imageError && !failedImageIds.has(item.id);
  const isSoldOut = item.availability === false;

  const cardStyle = {
    backgroundColor: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: "var(--radius)",
  };

  const handleEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.borderColor = "#D1D5DB";
    e.currentTarget.style.transform = "translateY(-1px)";
  };
  const handleLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.borderColor = "#E5E7EB";
    e.currentTarget.style.transform = "translateY(0)";
  };

  // --- No Images layout ---
  if (layout === "no-images") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        onClick={isSoldOut ? undefined : onClick}
        className={`group overflow-hidden flex flex-row items-center gap-4 p-4 transition-all duration-200 ${isSoldOut ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        style={cardStyle}
        onMouseEnter={isSoldOut ? undefined : handleEnter}
        onMouseLeave={isSoldOut ? undefined : handleLeave}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <h4 className="font-bold text-sm leading-tight line-clamp-1 group-hover:text-[color:var(--primary)] transition-colors" style={{ color: "#111827" }}>
              {item.name}
            </h4>
            {showBadges && item.is_new && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ border: "1px solid var(--primary)", color: "var(--primary)", backgroundColor: "#FFFFFF" }}>
                New
              </span>
            )}
            {showBadges && item.is_popular && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ border: "1px solid var(--primary)", color: "var(--primary)", backgroundColor: "#FFFFFF" }}>
                Popular
              </span>
            )}
            {isSoldOut && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}>
                Sold Out
              </span>
            )}
          </div>
          {item.description && (
            <p className="text-xs line-clamp-1 mt-0.5" style={{ color: "#6B7280" }}>
              {item.description}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="font-semibold text-sm" style={{ color: "#111827" }}>
            ${getStorefrontBrowsePrice(item).toFixed(2)}
          </span>
          {getStorefrontDeliveryPriceLabel(item) && (
            <span className="text-[10px] text-slate-500">{getStorefrontDeliveryPriceLabel(item)}</span>
          )}
        </div>
        <AddButton item={item} onClick={onClick} />
      </motion.div>
    );
  }

  // --- Side-by-Side layout ---
  if (layout === "sidebyside") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        onClick={isSoldOut ? undefined : onClick}
        className={`group overflow-hidden flex flex-row min-h-[100px] transition-all duration-200 ${isSoldOut ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        style={cardStyle}
        onMouseEnter={isSoldOut ? undefined : handleEnter}
        onMouseLeave={isSoldOut ? undefined : handleLeave}
      >
        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <h4 className="font-bold text-sm leading-tight line-clamp-1 group-hover:text-[color:var(--primary)] transition-colors" style={{ color: "#111827" }}>
                {item.name}
              </h4>
              {showBadges && item.is_new && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ border: "1px solid var(--primary)", color: "var(--primary)", backgroundColor: "#FFFFFF" }}>
                  New
                </span>
              )}
              {showBadges && item.is_popular && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ border: "1px solid var(--primary)", color: "var(--primary)", backgroundColor: "#FFFFFF" }}>
                  Popular
                </span>
              )}
            </div>
            {item.dietary_tags && item.dietary_tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {item.dietary_tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, #FFFFFF)", color: "var(--primary)" }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {item.description && (
              <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: "#6B7280" }}>
                {item.description}
              </p>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="font-semibold text-sm" style={{ color: "#111827" }}>
                ${getStorefrontBrowsePrice(item).toFixed(2)}
              </span>
              {getStorefrontDeliveryPriceLabel(item) && (
                <span className="text-[10px] text-slate-500">{getStorefrontDeliveryPriceLabel(item)}</span>
              )}
            </div>
            <AddButton item={item} onClick={onClick} />
          </div>
        </div>
        {showImage ? (
          <div className="relative m-2 ml-0 size-28 shrink-0 self-center overflow-hidden rounded-lg sm:m-0 sm:h-auto sm:w-24 sm:self-stretch sm:rounded-none" style={{ backgroundColor: "#F3F4F6" }}>
            <Image
              src={item.image!}
              fill
              alt={item.name}
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes="(max-width: 640px) 112px, 96px"
              onError={handleImageError}
            />
            {isSoldOut && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.75)" }}>
                <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}>
                  Sold Out
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="m-2 ml-0 flex size-28 shrink-0 self-center items-center justify-center rounded-lg sm:m-0 sm:h-auto sm:w-24 sm:self-stretch sm:rounded-none" style={{ backgroundColor: "#F9FAFB" }}>
            <span className="text-2xl font-bold" style={{ color: "var(--primary)", opacity: 0.3 }}>
              {item.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </motion.div>
    );
  }

  // --- Cards layout (default) ---
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      onClick={isSoldOut ? undefined : onClick}
      className={`group overflow-hidden flex flex-col transition-all duration-200 ${isSoldOut ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      style={cardStyle}
      onMouseEnter={isSoldOut ? undefined : handleEnter}
      onMouseLeave={isSoldOut ? undefined : handleLeave}
    >
      <div className="relative m-2 mb-0 aspect-square w-[calc(100%-1rem)] overflow-hidden rounded-lg sm:m-0 sm:aspect-video sm:w-full sm:rounded-none" style={{ backgroundColor: "#F3F4F6" }}>
        {showBadges && (item.is_new || item.is_popular) && (
          <div className="absolute top-2 right-2 z-10 flex flex-row gap-1">
            {item.is_new && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FFFFFF", border: "1px solid var(--primary)", color: "var(--primary)" }}>New</span>
            )}
            {item.is_popular && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FFFFFF", border: "1px solid var(--primary)", color: "var(--primary)" }}>Popular</span>
            )}
          </div>
        )}
        {!item.availability && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ backgroundColor: "rgba(255,255,255,0.75)" }}>
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}>Sold Out</span>
          </div>
        )}
        {showImage ? (
          <Image
            src={item.image!}
            fill
            alt={item.name}
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 768px) 100vw, 50vw"
            onError={handleImageError}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-3xl font-bold" style={{ color: "var(--primary)", opacity: 0.25 }}>
              {item.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col flex-1">
        <h4 className="font-bold text-sm line-clamp-2 mb-0.5 leading-tight group-hover:text-[color:var(--primary)] transition-colors" style={{ color: "#111827" }}>
          {item.name}
        </h4>
        {item.dietary_tags && item.dietary_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {item.dietary_tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, #FFFFFF)", color: "var(--primary)" }}>
                {tag}
              </span>
            ))}
          </div>
        )}
        {item.description && (
          <p className="text-xs line-clamp-2 leading-relaxed mb-2 flex-1" style={{ color: "#6B7280" }}>
            {item.description}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <div className="flex flex-col">
            <span className="text-sm font-semibold" style={{ color: "#111827" }}>
              ${getStorefrontBrowsePrice(item).toFixed(2)}
            </span>
            {getStorefrontDeliveryPriceLabel(item) && (
              <span className="text-[10px] text-slate-500">{getStorefrontDeliveryPriceLabel(item)}</span>
            )}
          </div>
          <AddButton item={item} onClick={onClick} />
        </div>
      </div>
    </motion.div>
  );
}
