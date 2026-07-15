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
import { useStorefrontPath } from "../../lib/use-storefront-path";
import { MenuSearch } from "../MenuSearch";
import {
  getStorefrontBrowsePrice,
  getStorefrontDeliveryPriceLabel,
} from "../../lib/storefront-pricing";
import { motion, AnimatePresence } from "motion/react";
import { Plus, ChevronUp, SlidersHorizontal, LayoutGrid, LayoutList, ListFilter } from "lucide-react";

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
type ViewMode = "grid" | "list";

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
  // While a pill click is smooth-scrolling, lock the highlight to the target so
  // the scroll-spy doesn't flicker to sections passed en route.
  const scrollLockRef = useRef<string | null>(null);
  const scrollLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedItem, setSelectedItem] = useState<StorefrontItem | null>(null);
  const [selectedCategoryItems, setSelectedCategoryItems] = useState<StorefrontItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeTag, setActiveTag] = useState<string | null>(null);

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
    () => allCategories.flatMap((c) => c.items),
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

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allCategories.forEach((c) => { counts[c.id] = c.items.length; });
    return counts;
  }, [allCategories]);

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
    // Safety release in case the target never precisely reaches the boundary.
    scrollLockTimerRef.current = setTimeout(() => {
      scrollLockRef.current = null;
    }, 1000);
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
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      if (atBottom) {
        scrollLockRef.current = null;
        setActiveCategory(sections[sections.length - 1].cat.id);
        return;
      }
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      const boundary = headerHeight + (isDesktop ? 16 : navHeight + 8) + 8;
      let current = sections[0].cat.id;
      for (const { cat } of sections) {
        const el = document.getElementById(`market-cat-${cat.id}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top - boundary <= 1) {
          current = cat.id;
        } else {
          break;
        }
      }
      // While locked to a click target, keep it highlighted regardless of
      // sections passed (or slightly overshot) during the smooth scroll. The
      // lock is released by an idle timer once scrolling settles.
      if (scrollLockRef.current) {
        setActiveCategory(scrollLockRef.current);
        return;
      }
      setActiveCategory(current);
    };

    updateActiveCategory();
    let ticking = false;
    const onScroll = () => {
      // Refresh the idle timer: release the click-lock only once the smooth
      // scroll has fully stopped, then re-sync to the real scroll position.
      if (scrollLockRef.current) {
        if (scrollLockTimerRef.current) clearTimeout(scrollLockTimerRef.current);
        scrollLockTimerRef.current = setTimeout(() => {
          scrollLockRef.current = null;
          updateActiveCategory();
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

  // Keep the active pill visible within each horizontal/vertical nav strip.
  useEffect(() => {
    if (!activeCategory) return;
    const mobile = mobilePillsRef.current?.querySelector<HTMLElement>(`[data-cat-pill="${activeCategory}"]`);
    if (mobile && mobilePillsRef.current) {
      const c = mobilePillsRef.current.getBoundingClientRect();
      const p = mobile.getBoundingClientRect();
      if (p.left < c.left || p.right > c.right) {
        mobilePillsRef.current.scrollBy({ left: p.left - c.left - (c.width - p.width) / 2, behavior: "smooth" });
      }
    }
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
          {/* Menu tabs — only when multiple menus */}
          {menus.length > 1 && (
            <div className="container mx-auto px-4 border-b" style={{ borderColor: "#E5E7EB" }}>
              <div className="flex overflow-x-auto gap-1" style={{ scrollbarWidth: "none" }}>
                {menus.map((menu) => {
                  const isActive = activeMenuId === menu.id;
                  return (
                    <button
                      key={menu.id}
                      type="button"
                      onClick={() => setActiveMenuId(menu.id)}
                      className="px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px shrink-0 uppercase tracking-wide"
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
            </div>
          )}
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

              <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B7280" }}>
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Categories
                </div>
                <nav ref={sidebarNavRef} className="space-y-0.5 max-h-[60vh] overflow-y-auto">
                  {sectionsWithItems.map(({ cat }) => {
                    const isActive = activeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        data-cat-pill={cat.id}
                        onClick={() => scrollToCategory(cat.id)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all"
                        style={{
                          backgroundColor: isActive ? "color-mix(in srgb, var(--primary) 8%, #FFFFFF)" : "transparent",
                          color: isActive ? "var(--primary)" : "#6B7280",
                          fontWeight: isActive ? 600 : 400,
                          borderLeft: isActive ? "3px solid var(--primary)" : "3px solid transparent",
                        }}
                      >
                        <span>{cat.name}</span>
                        <span className="text-xs" style={{ color: isActive ? "var(--primary)" : "#9CA3AF" }}>
                          {categoryCounts[cat.id] ?? 0}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {activeTags.length > 0 && (
                <div className="rounded-xl border p-4" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B7280" }}>
                    Popular Tags
                  </div>
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
                          data-cat-pill={cat.id}
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

              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm" style={{ color: "#6B7280" }}>
                  {`${totalVisibleItems} item${totalVisibleItems !== 1 ? "s" : ""}`}
                </p>
                <div className="flex items-center gap-2">
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
                  <button
                    type="button"
                    aria-label="Filter"
                    className="h-8 w-8 flex items-center justify-center rounded-lg border transition-colors"
                    style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", color: "#6B7280" }}
                  >
                    <ListFilter className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border transition-colors"
                    style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", color: "#6B7280" }}
                  >
                    {viewMode === "grid" ? <LayoutList className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                  </button>
                </div>
              </div>

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
                      <h2 className="text-base font-semibold mb-3 pb-2 border-b" style={{ color: "var(--primary)", borderColor: "#E5E7EB" }}>
                        {cat.name}
                        <span className="ml-2 text-xs font-normal" style={{ color: "#9CA3AF" }}>({items.length})</span>
                      </h2>
                      <div className={viewMode === "grid" ? "grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-3"}>
                        {items.map((item) => (
                          <MarketItemCard
                            key={item.id}
                            item={item}
                            viewMode={viewMode}
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

function MarketItemCard({
  item,
  viewMode,
  failedImageIds,
  onImageError,
  onClick,
}: {
  item: StorefrontItem;
  viewMode: ViewMode;
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

  if (viewMode === "list") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.25 }}
        onClick={isSoldOut ? undefined : onClick}
        onMouseEnter={isSoldOut ? undefined : handleEnter}
        onMouseLeave={isSoldOut ? undefined : handleLeave}
        className={`group flex items-center gap-4 p-3 overflow-hidden ${isSoldOut ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        style={cardStyle}
      >
        <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden relative" style={{ backgroundColor: "#F3F4F6" }}>
          {showImage ? (
            <Image src={item.image!} fill alt={item.name} className="object-cover" sizes="64px" onError={() => onImageError(item.id)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xl font-bold" style={{ color: "var(--primary)", opacity: 0.25 }}>
                {item.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm line-clamp-1 group-hover:text-[color:var(--primary)] transition-colors" style={{ color: "#111827" }}>
            {item.name}
          </h4>
          {item.description && (
            <p className="text-xs line-clamp-1 mt-0.5" style={{ color: "#6B7280" }}>{item.description}</p>
          )}
          {(item.is_new || item.is_popular) && (
            <div className="flex gap-1 mt-1">
              {item.is_new && <span className="text-[10px] px-1.5 py-0.5 rounded-full border" style={{ color: "var(--primary)", borderColor: "var(--primary)" }}>New</span>}
              {item.is_popular && <span className="text-[10px] px-1.5 py-0.5 rounded-full border" style={{ color: "var(--primary)", borderColor: "var(--primary)" }}>Popular</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex flex-col items-end min-w-0 max-w-[110px]">
            <span className="font-semibold text-sm truncate max-w-full" style={{ color: "#111827" }}>${getStorefrontBrowsePrice(item).toFixed(2)}</span>
            {getStorefrontDeliveryPriceLabel(item) && (
              <span className="text-[10px] truncate max-w-full" style={{ color: "#6B7280" }}>{getStorefrontDeliveryPriceLabel(item)}</span>
            )}
          </div>
          {!isSoldOut && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full transition-all"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  // Grid card — vertical with image top
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.3 }}
      onClick={isSoldOut ? undefined : onClick}
      onMouseEnter={isSoldOut ? undefined : handleEnter}
      onMouseLeave={isSoldOut ? undefined : handleLeave}
      className={`group overflow-hidden flex flex-col ${isSoldOut ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      style={cardStyle}
    >
      <div className="w-full aspect-video relative overflow-hidden" style={{ backgroundColor: "#F3F4F6" }}>
        {item.is_new && (
          <span className="absolute top-2 left-2 z-10 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}>
            NEW
          </span>
        )}
        {item.is_popular && !item.is_new && (
          <span className="absolute top-2 left-2 z-10 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#F59E0B", color: "#FFFFFF" }}>
            POPULAR
          </span>
        )}
        {showImage ? (
          <Image src={item.image!} fill alt={item.name} className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="(max-width: 768px) 100vw, 33vw" onError={() => onImageError(item.id)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-3xl font-bold" style={{ color: "var(--primary)", opacity: 0.2 }}>{item.name.charAt(0).toUpperCase()}</span>
          </div>
        )}
        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.75)" }}>
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}>Sold Out</span>
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col flex-1">
        <h4 className="font-semibold text-sm line-clamp-2 mb-0.5 group-hover:text-[color:var(--primary)] transition-colors" style={{ color: "#111827" }}>
          {item.name}
        </h4>
        {item.description && (
          <p className="text-xs line-clamp-2 flex-1 mb-2" style={{ color: "#6B7280" }}>{item.description}</p>
        )}
        <div className="flex items-center justify-between gap-2 mt-auto">
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm truncate max-w-full" style={{ color: "#111827" }}>${getStorefrontBrowsePrice(item).toFixed(2)}</span>
            {getStorefrontDeliveryPriceLabel(item) && (
              <span className="text-[10px] truncate max-w-full" style={{ color: "#6B7280" }}>{getStorefrontDeliveryPriceLabel(item)}</span>
            )}
          </div>
          {!isSoldOut && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full transition-all"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
              aria-label={`Add ${item.name} to cart`}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
