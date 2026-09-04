"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Site } from "@/types/site";
import { StorefrontMenu, StorefrontItem } from "@/types/storefront";
import { StorefrontHeader } from "../StorefrontHeader";
import { AccountDrawer } from "../AccountDrawer";
import { OrdersSheet } from "../OrdersSheet";
import { OrderStatusWatcher } from "../OrderStatusWatcher";
import { QrTableBanner } from "../QrTableBanner";
import { MobileBottomTabs, TabType } from "../MobileBottomTabs";
import { OrdersPanel } from "../OrdersPanel";
import { ItemDetailsModal } from "../ItemDetailsModal";
import { useCart } from "../../hooks/useCart";
import { useSession } from "../../hooks/useSession";
import { useSessionInit } from "../../hooks/useSessionInit";
import { useQrFunnelTracking } from "../../hooks/useQrFunnelTracking";
import { useActiveItemAutoScroll } from "../../hooks/useActiveItemAutoScroll";
import { useStorefrontPath } from "../../lib/use-storefront-path";
import { MenuSearch } from "../MenuSearch";
import { StoreHoursModal } from "../StoreHoursModal";
import { getOpenUntilString, isStoreOpenNow } from "../StoreInfoBar";
import {
  getStorefrontBrowsePrice,
  getStorefrontDeliveryPriceLabel,
} from "../../lib/storefront-pricing";
import { motion, AnimatePresence } from "motion/react";
import { Plus, ChevronUp, MapPin, Clock, Store, Truck, ArrowLeft, ArrowRight } from "lucide-react";

interface MarketLayoutProps {
  site: Site | null;
  location: {
    id: string;
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    phone: string | null;
    email: string | null;
    business_hours: any;
    latitude?: number | null;
    longitude?: number | null;
    timezone?: string | null;
  };
  menus: StorefrontMenu[];
  slug: string;
  seedQrSession?: {
    sessionToken: string;
    floorPlanObjectId?: string | null;
    tableLabel?: string | null;
    tableQrCodeId?: string | null;
  } | null;
}

type SortOption = "default" | "price_asc" | "price_desc" | "name";

function isValidImageSrc(src?: string | null): boolean {
  return !!src && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/"));
}

const POPULAR_TAGS = ["Popular", "New", "Vegan", "Gluten-Free", "Spicy"];

export function MarketLayout({
  site,
  location,
  menus,
  slug,
  seedQrSession,
}: MarketLayoutProps) {
  useSessionInit(site?.id, seedQrSession);
  const router = useRouter();
  const activeOrderId = useSession((s) => s.activeOrderId);
  const qrTableLabel = useSession((s) => s.qrTableLabel);
  const storefrontPath = useStorefrontPath(slug);

  const [activeTab, setActiveTab] = useState<TabType>("menu");
  const [isOrdersSheetOpen, setIsOrdersSheetOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [showWelcomeDrawer, setShowWelcomeDrawer] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(56);

  useQrFunnelTracking({
    trackMenuViewed: activeTab === "menu",
    trackCartStarted: true,
  });

  const [activeMenuId, setActiveMenuId] = useState<string>(() => menus[0]?.id ?? "");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [navHeight, setNavHeight] = useState(0);
  const mobilePillsRef = useRef<HTMLDivElement>(null);
  const sidebarNavRef = useRef<HTMLDivElement>(null);
  const menuTabsRef = useRef<HTMLDivElement>(null);
  const popularRowRef = useRef<HTMLDivElement>(null);
  // While a pill click is smooth-scrolling, lock the highlight to the target so
  // the scroll-spy doesn't flicker to sections passed en route.
  const scrollLockRef = useRef<string | null>(null);
  const scrollLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedItem, setSelectedItem] = useState<StorefrontItem | null>(null);
  const [selectedCategoryItems, setSelectedCategoryItems] = useState<StorefrontItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [hoursModalOpen, setHoursModalOpen] = useState(false);

  // Store header details — reuses the same hours helpers as StoreInfoBar so the
  // open/closed logic stays in one place.
  const storeName = site?.title || location.name;
  const pickupEnabled = site?.online_ordering_config?.pickupEnabled !== false;
  const deliveryEnabled = site?.online_ordering_config?.deliveryEnabled === true;
  const rawBusinessHours =
    site?.online_ordering_config?.operatingHours || location.business_hours;
  const locationTimezone = location.timezone ?? null;
  const isStoreOpen = useMemo(
    () => isStoreOpenNow(rawBusinessHours, locationTimezone),
    [rawBusinessHours, locationTimezone]
  );
  const openUntilText = useMemo(
    () => getOpenUntilString(rawBusinessHours, locationTimezone),
    [rawBusinessHours, locationTimezone]
  );

  const { setOpen: setCartOpen, pendingModalItem, clearPendingModalItem } = useCart();

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);


  useEffect(() => {
    const update = () => {
      const header = document.getElementById("storefront-header");
      if (header) setHeaderHeight(header.offsetHeight);
    };
    update();
    const header = document.getElementById("storefront-header");
    if (!header) return;
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  const activeMenu = menus.find((m) => m.id === activeMenuId);
  const allCategories = activeMenu?.categories ?? [];

  // Items scoped to the active menu only (not all menus)
  const allItems = useMemo(
    () => {
      const uniqueItems = new Map<string, StorefrontItem>();
      for (const category of allCategories) {
        for (const item of category.items) {
          if (!uniqueItems.has(item.id)) uniqueItems.set(item.id, item);
        }
      }
      return Array.from(uniqueItems.values());
    },
    [allCategories]
  );

  // Apply the active tag + sort to a category's items (used per stacked section).
  const processItems = useCallback((items: StorefrontItem[]) => {
    let result = items;
    if (activeTag === "Popular") result = result.filter((i) => i.is_popular);
    else if (activeTag === "New") result = result.filter((i) => i.is_new);
    else if (activeTag) result = result.filter((i) => (i.dietary_tags || []).some((t) => t.toLowerCase().includes(activeTag.toLowerCase())));

    switch (sortOption) {
      case "price_asc": return [...result].sort((a, b) => getStorefrontBrowsePrice(a) - getStorefrontBrowsePrice(b));
      case "price_desc": return [...result].sort((a, b) => getStorefrontBrowsePrice(b) - getStorefrontBrowsePrice(a));
      case "name": return [...result].sort((a, b) => a.name.localeCompare(b.name));
      default: return result;
    }
  }, [activeTag, sortOption]);

  // Every category stays rendered as a stacked section (only hidden when a tag
  // filter empties it). Clicking a pill scrolls here; scrolling highlights it.
  const sectionsWithItems = useMemo(
    () =>
      allCategories
        .map((cat) => ({ cat, items: processItems(cat.items) }))
        .filter(({ items }) => items.length > 0),
    [allCategories, processItems]
  );

  // "Popular" — sourced from the merchant-set is_popular flag (there is no
  // store-wide order-volume aggregate in the DB, so this is a curated list, not
  // a sales ranking). Hidden when nothing is flagged, and suppressed while a
  // tag filter is narrowing the menu.
  const popularItems = useMemo(
    () => (activeTag ? [] : allItems.filter((i) => i.is_popular && i.availability !== false)),
    [allItems, activeTag]
  );

  const scrollPopular = useCallback((direction: -1 | 1) => {
    const el = popularRowRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.8, 240), behavior: "smooth" });
  }, []);

  const totalVisibleItems = useMemo(
    () => sectionsWithItems.reduce((sum, s) => sum + s.items.length, 0),
    [sectionsWithItems]
  );

  const handleImageError = useCallback((itemId: string) => {
    setFailedImageIds((prev) => new Set(prev).add(itemId));
  }, []);

  const handleItemClick = useCallback((item: StorefrontItem) => {
    setSelectedItem(item);
    let catItems: StorefrontItem[] = [];
    for (const menu of menus) {
      for (const cat of menu.categories) {
        if (cat.items.some((i) => i.id === item.id)) { catItems = cat.items; break; }
      }
      if (catItems.length) break;
    }
    setSelectedCategoryItems(catItems);
    setIsModalOpen(true);
  }, [menus]);

  useEffect(() => {
    if (pendingModalItem) { handleItemClick(pendingModalItem); clearPendingModalItem(); }
  }, [pendingModalItem, handleItemClick, clearPendingModalItem]);

  const handleTabChange = (tab: TabType) => {
    if (tab === "cart") { setCartOpen(true); return; }
    if (tab === "account") { setIsAccountOpen(true); return; }
    if (tab === "info") { router.push(storefrontPath("/info")); return; }
    setActiveTab(tab);
  };

  const sortLabels: Record<SortOption, string> = {
    default: "Default",
    price_asc: "Price: Low to High",
    price_desc: "Price: High to Low",
    name: "Name A–Z",
  };

  // Tags that actually have matches in the active menu
  const activeTags = POPULAR_TAGS.filter((tag) => {
    if (tag === "Popular") return allItems.some((i) => i.is_popular);
    if (tag === "New") return allItems.some((i) => i.is_new);
    return allItems.some((i) => (i.dietary_tags || []).some((t) => t.toLowerCase().includes(tag.toLowerCase())));
  });

  // Default the active category to the first visible section (and re-seed when
  // the menu or filters change the set of visible sections).
  useEffect(() => {
    if (sectionsWithItems.length === 0) return;
    if (!sectionsWithItems.some((s) => s.cat.id === activeCategory)) {
      setActiveCategory(sectionsWithItems[0].cat.id);
    }
  }, [sectionsWithItems, activeCategory]);

  // Measure the mobile sticky category-nav height (offset for scroll targeting).
  useEffect(() => {
    const update = () => {
      const nav = document.getElementById("market-mobile-catnav");
      setNavHeight(nav ? nav.offsetHeight : 0);
    };
    update();
    const nav = document.getElementById("market-mobile-catnav");
    if (!nav) return;
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [activeMenuId, sectionsWithItems.length]);

  const scrollToCategory = useCallback((categoryId: string) => {
    setActiveCategory(categoryId);
    const el = document.getElementById(`market-cat-${categoryId}`);
    if (!el) return;
    // Lock the highlight to this target until the smooth-scroll settles, so the
    // spy doesn't briefly light up sections we pass through.
    scrollLockRef.current = categoryId;
    if (scrollLockTimerRef.current) clearTimeout(scrollLockTimerRef.current);
    // Safety release for the case where the target is already in position and
    // scrollTo emits no events at all, leaving nothing to refresh the timer.
    scrollLockTimerRef.current = setTimeout(() => {
      scrollLockRef.current = null;
    }, 700);
    // On mobile the category nav is sticky under the header; on desktop it isn't.
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    const offset = headerHeight + (isDesktop ? 16 : navHeight + 8);
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  }, [headerHeight, navHeight]);

  // Scroll-spy: highlight the category currently filling the viewport. Works in
  // both scroll directions, with a bottom-of-page guard for short trailing
  // sections (mirrors the Classic MenuBrowser behavior).
  useEffect(() => {
    const sections = sectionsWithItems;
    if (sections.length === 0) return;

    const updateActiveCategory = () => {
      // A click-lock outranks everything, including the bottom-of-page guard:
      // clicking a short trailing category lands at the page bottom, and that
      // guard would otherwise yank the highlight to the last section.
      if (scrollLockRef.current) {
        setActiveCategory(scrollLockRef.current);
        return;
      }
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      if (atBottom) {
        setActiveCategory(sections[sections.length - 1].cat.id);
        return;
      }
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      const boundary = headerHeight + (isDesktop ? 16 : navHeight + 8) + 8;
      // Highlight the section owning the boundary line (top at/above it, bottom
      // still below it) so a pill activates only once the previous section has
      // fully scrolled off the top, not when its heading first appears.
      let current = sections[0].cat.id;
      for (const { cat } of sections) {
        const el = document.getElementById(`market-cat-${cat.id}`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top - boundary <= 1 && rect.bottom - boundary > 1) {
          current = cat.id;
          break;
        }
        if (rect.top - boundary <= 1) current = cat.id;
      }
      setActiveCategory(current);
    };

    updateActiveCategory();
    let ticking = false;
    const onScroll = () => {
      // Refresh the idle timer: release the click-lock only once the smooth
      // scroll has fully stopped. Don't re-derive the category on release — the
      // scroll settles with the target's top exactly on the boundary, where
      // sub-pixel rounding can resolve to the *previous* section and flash the
      // highlight back for a frame. The clicked target is authoritative; the
      // next real scroll takes over from there.
      if (scrollLockRef.current) {
        if (scrollLockTimerRef.current) clearTimeout(scrollLockTimerRef.current);
        scrollLockTimerRef.current = setTimeout(() => {
          scrollLockRef.current = null;
        }, 120);
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
  }, [sectionsWithItems, headerHeight, navHeight]);

  useActiveItemAutoScroll(mobilePillsRef, activeCategory);
  useActiveItemAutoScroll(menuTabsRef, activeMenuId);

  // Keep the active category visible within the desktop vertical sidebar.
  useEffect(() => {
    if (!activeCategory) return;
    const side = sidebarNavRef.current?.querySelector<HTMLElement>(`[data-cat-pill="${activeCategory}"]`);
    side?.scrollIntoView({ block: "nearest" });
  }, [activeCategory]);

  return (
    <>
      <OrderStatusWatcher orderId={activeOrderId} />

      <StorefrontHeader
        site={site}
        storeConfigId={site?.id}
        onInfoClick={() => router.push(storefrontPath("/info"))}
        onOrdersClick={() => setIsOrdersSheetOpen(true)}
        onAccountClick={() => setIsAccountOpen(true)}
        onAuthSuccess={() => { setShowWelcomeDrawer(true); setIsAccountOpen(true); }}
      />

      {activeTab === "menu" ? (
        <>
          <div className="container mx-auto px-4 py-6 pb-32 lg:pb-8 flex flex-col lg:flex-row gap-6">
            {/* Left sidebar — desktop only */}
            <aside
              className="hidden lg:block shrink-0 w-56 lg:sticky self-start"
              style={{ top: headerHeight + 16 }}
            >
              {/* Search */}
              <div className="mb-4">
                <MenuSearch
                  menus={menus}
                  variant="bar"
                  placeholder="Search…"
                  onResultClick={handleItemClick}
                />
              </div>

              {/* Bare category list — no card, no borders. Only the active
                  category is highlighted (solid fill), the rest are plain text. */}
              <nav ref={sidebarNavRef} className="space-y-0.5 max-h-[70vh] overflow-y-auto mb-4">
                {sectionsWithItems.map(({ cat }) => {
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      data-cat-pill={cat.id}
                      onClick={() => scrollToCategory(cat.id)}
                      className="w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors"
                      style={{
                        backgroundColor: isActive ? "var(--primary)" : "transparent",
                        color: isActive ? "var(--primary-text)" : "#374151",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </nav>

              {activeTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activeTags.map((tag) => {
                    const isActive = activeTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setActiveTag(isActive ? null : tag)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                        style={{
                          backgroundColor: isActive ? "var(--primary)" : "#F3F4F6",
                          color: isActive ? "var(--primary-text)" : "#374151",
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </aside>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <QrTableBanner tableLabel={qrTableLabel} className="mb-4" />
              {/* Mobile search */}
              <div className="lg:hidden mb-3">
                <MenuSearch
                  menus={menus}
                  variant="bar"
                  placeholder="Search menu…"
                  onResultClick={handleItemClick}
                />
              </div>

              {/* Mobile category pills — sticky scroll-nav */}
              <div
                id="market-mobile-catnav"
                className="lg:hidden sticky z-30 -mx-4 px-4 py-2 mb-4"
                style={{ top: headerHeight, backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E7EB" }}
              >
                <div ref={mobilePillsRef} className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  <div className="flex gap-2">
                    {sectionsWithItems.map(({ cat }) => {
                      const isActive = activeCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          data-auto-scroll-id={cat.id}
                          onClick={() => scrollToCategory(cat.id)}
                          className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                          style={{
                            backgroundColor: isActive ? "var(--primary)" : "#FFFFFF",
                            color: isActive ? "var(--primary-text)" : "#6B7280",
                            border: `1px solid ${isActive ? "var(--primary)" : "#E5E7EB"}`,
                          }}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Store header — branch name, address, hours, services */}
              <div className="mb-5">
                <h1
                  className="text-2xl sm:text-3xl font-bold leading-tight"
                  style={{ color: "#111827", fontFamily: "var(--font-display)" }}
                >
                  {storeName}
                </h1>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={{ color: "#6B7280" }}>
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} />
                    <span className="truncate">
                      {location.address_line1}, {location.city}, {location.state}
                    </span>
                  </span>

                  {(openUntilText || isStoreOpen !== null) && (
                    <>
                      <span aria-hidden="true" style={{ color: "#D1D5DB" }}>·</span>
                      <button
                        type="button"
                        onClick={() => setHoursModalOpen(true)}
                        className="inline-flex items-center gap-1.5 underline underline-offset-2 transition-opacity hover:opacity-75"
                        style={{ color: isStoreOpen === false ? "#DC2626" : "var(--primary)" }}
                      >
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        {isStoreOpen === false ? "Closed" : openUntilText || "See hours"}
                      </button>
                    </>
                  )}
                </div>

                {/* Available services */}
                {(pickupEnabled || deliveryEnabled) && (
                  <div className="mt-3 flex items-center gap-2">
                    {pickupEnabled && (
                      <span
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full"
                        style={{ border: "1px solid #E5E7EB", color: "#374151", backgroundColor: "#FFFFFF" }}
                      >
                        <Store className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                        Pickup
                      </span>
                    )}
                    {deliveryEnabled && (
                      <span
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full"
                        style={{ border: "1px solid #E5E7EB", color: "#374151", backgroundColor: "#FFFFFF" }}
                      >
                        <Truck className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                        Delivery
                      </span>
                    )}
                  </div>
                )}

                {/* Menu tabs — sit under the branch details, above the items */}
                {menus.length > 1 && (
                  <div ref={menuTabsRef} className="mt-4 flex overflow-x-auto gap-1" style={{ scrollbarWidth: "none" }}>
                    {menus.map((menu) => {
                      const isActive = activeMenuId === menu.id;
                      return (
                        <button
                          key={menu.id}
                          data-auto-scroll-id={menu.id}
                          type="button"
                          onClick={() => setActiveMenuId(menu.id)}
                          className="px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 shrink-0 uppercase tracking-wide"
                          style={{
                            borderColor: isActive ? "var(--primary)" : "transparent",
                            color: isActive ? "var(--primary)" : "#9CA3AF",
                            backgroundColor: "transparent",
                          }}
                        >
                          {menu.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm" style={{ color: "#6B7280" }}>
                  {`${totalVisibleItems} item${totalVisibleItems !== 1 ? "s" : ""}`}
                </p>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className="text-xs rounded-lg border px-3 py-1.5 h-8"
                  style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", color: "#374151" }}
                >
                  {(Object.keys(sortLabels) as SortOption[]).map((opt) => (
                    <option key={opt} value={opt}>{sortLabels[opt]}</option>
                  ))}
                </select>
              </div>

              {/* Popular — horizontal carousel of merchant-flagged items */}
              {popularItems.length > 0 && (
                <section className="mb-10">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-semibold" style={{ color: "var(--primary)" }}>
                      Popular
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => scrollPopular(-1)}
                        aria-label="Scroll left"
                        className="h-8 w-8 flex items-center justify-center rounded-full transition-opacity hover:opacity-80"
                        style={{ backgroundColor: "#F3F4F6", color: "#374151" }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollPopular(1)}
                        aria-label="Scroll right"
                        className="h-8 w-8 flex items-center justify-center rounded-full transition-opacity hover:opacity-80"
                        style={{ backgroundColor: "#F3F4F6", color: "#374151" }}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div
                    ref={popularRowRef}
                    className="flex gap-4 overflow-x-auto pb-1"
                    style={{ scrollbarWidth: "none", scrollSnapType: "x mandatory" }}
                  >
                    {popularItems.map((item) => (
                      <PopularItemCard
                        key={item.id}
                        item={item}
                        failedImageIds={failedImageIds}
                        onImageError={handleImageError}
                        onClick={() => handleItemClick(item)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Stacked category sections — every category rendered; pills
                  scroll to them and highlight on scroll. */}
              {sectionsWithItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-lg font-semibold" style={{ color: "#111827" }}>No items found</p>
                  <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Try a different tag or sort</p>
                </div>
              ) : (
                <div className="space-y-10">
                  {sectionsWithItems.map(({ cat, items }) => (
                    <section
                      key={cat.id}
                      id={`market-cat-${cat.id}`}
                      style={{ scrollMarginTop: headerHeight + navHeight + 16 }}
                    >
                      <h2 className="text-base font-semibold mb-3" style={{ color: "var(--primary)" }}>
                        {cat.name}
                        <span className="ml-2 text-xs font-normal" style={{ color: "#9CA3AF" }}>({items.length})</span>
                      </h2>
                      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
                        {items.map((item) => (
                          <MarketItemCard
                            key={item.id}
                            item={item}
                            failedImageIds={failedImageIds}
                            onImageError={handleImageError}
                            onClick={() => handleItemClick(item)}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <main className="container mx-auto px-4 py-6 pb-28">
          <OrdersPanel slug={slug} storeConfigId={site?.id} />
        </main>
      )}

      <MobileBottomTabs activeTab={activeTab} onTabChange={handleTabChange} />

      <OrdersSheet
        isOpen={isOrdersSheetOpen}
        onOpenChange={setIsOrdersSheetOpen}
        slug={slug}
        storeConfigId={site?.id}
      />
      <AccountDrawer
        isOpen={isAccountOpen}
        onOpenChange={setIsAccountOpen}
        storeConfigId={site?.id ?? ""}
        showWelcomeOnMount={showWelcomeDrawer}
        onWelcomeShown={() => setShowWelcomeDrawer(false)}
      />

      <ItemDetailsModal
        item={selectedItem}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        categoryItems={selectedCategoryItems}
        onItemSelect={handleItemClick}
      />

      <StoreHoursModal
        open={hoursModalOpen}
        onOpenChange={setHoursModalOpen}
        businessHours={rawBusinessHours}
        timezone={locationTimezone}
        storeName={storeName}
        isStoreOpen={isStoreOpen}
      />

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-28 right-4 z-[55] w-11 h-11 flex items-center justify-center rounded-full lg:bottom-6"
            style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
            aria-label="Scroll to top"
          >
            <ChevronUp className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}

// "Popular" carousel card — image on top, name and price beneath, no card
// chrome (Charcoal style). The + button overlays the image bottom-right.
function PopularItemCard({
  item,
  failedImageIds,
  onImageError,
  onClick,
}: {
  item: StorefrontItem;
  failedImageIds: Set<string>;
  onImageError: (id: string) => void;
  onClick: () => void;
}) {
  const showImage = isValidImageSrc(item.image) && !failedImageIds.has(item.id);

  return (
    <div
      onClick={onClick}
      className="group shrink-0 w-40 sm:w-44 cursor-pointer"
      style={{ scrollSnapAlign: "start" }}
    >
      <div
        className="relative w-full aspect-square overflow-hidden"
        style={{ backgroundColor: "#F3F4F6", borderRadius: "var(--radius)" }}
      >
        {showImage ? (
          <Image
            src={item.image!}
            fill
            alt={item.name}
            className="object-cover"
            sizes="176px"
            onError={() => onImageError(item.id)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-3xl font-bold" style={{ color: "var(--primary)", opacity: 0.2 }}>
              {item.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="absolute bottom-2 right-2 w-8 h-8 flex items-center justify-center rounded-full transition-all"
          style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
          aria-label={`Add ${item.name} to cart`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <h4
        className="mt-2 text-sm font-bold line-clamp-2 group-hover:text-[color:var(--primary)] transition-colors"
        style={{ color: "#111827" }}
      >
        {item.name}
      </h4>
      <span className="text-sm" style={{ color: "#111827" }}>
        ${getStorefrontBrowsePrice(item).toFixed(2)}
      </span>
    </div>
  );
}

// Single card layout: details on the left, photo on the right (Charcoal style).
function MarketItemCard({
  item,
  failedImageIds,
  onImageError,
  onClick,
}: {
  item: StorefrontItem;
  failedImageIds: Set<string>;
  onImageError: (id: string) => void;
  onClick: () => void;
}) {
  const isSoldOut = item.availability === false;
  const showImage = isValidImageSrc(item.image) && !failedImageIds.has(item.id);

  const cardStyle = {
    backgroundColor: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: "var(--radius)",
    transition: "all 0.2s",
  };

  const handleEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
    e.currentTarget.style.transform = "translateY(-2px)";
  };
  const handleLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.boxShadow = "";
    e.currentTarget.style.transform = "translateY(0)";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.3 }}
      onClick={isSoldOut ? undefined : onClick}
      onMouseEnter={isSoldOut ? undefined : handleEnter}
      onMouseLeave={isSoldOut ? undefined : handleLeave}
      className={`group relative flex items-stretch overflow-hidden ${isSoldOut ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      style={cardStyle}
    >
      {/* Details — left */}
      <div className="flex-1 min-w-0 p-4 flex flex-col">
        <h4 className="font-bold text-sm group-hover:text-[color:var(--primary)] transition-colors" style={{ color: "#111827" }}>
          {item.name}
        </h4>
        <div className="flex flex-col mt-1">
          <span className="font-semibold text-sm" style={{ color: "#111827" }}>
            ${getStorefrontBrowsePrice(item).toFixed(2)}
          </span>
          {getStorefrontDeliveryPriceLabel(item) && (
            <span className="text-[10px]" style={{ color: "#6B7280" }}>{getStorefrontDeliveryPriceLabel(item)}</span>
          )}
        </div>
        {item.description && (
          <p className="text-xs line-clamp-3 mt-2" style={{ color: "#6B7280" }}>{item.description}</p>
        )}
        {(item.is_new || item.is_popular) && (
          <div className="flex gap-1 mt-2">
            {item.is_new && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border" style={{ color: "var(--primary)", borderColor: "var(--primary)" }}>New</span>
            )}
            {item.is_popular && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border" style={{ color: "var(--primary)", borderColor: "var(--primary)" }}>Popular</span>
            )}
          </div>
        )}
      </div>

      {/* Photo — right */}
      <div className="relative m-2 ml-0 size-28 shrink-0 self-center overflow-hidden rounded-lg sm:m-0 sm:h-auto sm:w-40 sm:self-stretch sm:rounded-none" style={{ backgroundColor: "#F3F4F6" }}>
        {showImage ? (
          <Image
            src={item.image!}
            fill
            alt={item.name}
            className="object-cover"
            sizes="(max-width: 640px) 112px, 160px"
            onError={() => onImageError(item.id)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-3xl font-bold" style={{ color: "var(--primary)", opacity: 0.2 }}>
              {item.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {isSoldOut ? (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.75)" }}>
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}>Sold Out</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="absolute bottom-2 right-2 w-8 h-8 flex items-center justify-center rounded-full transition-all"
            style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
            aria-label={`Add ${item.name} to cart`}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
