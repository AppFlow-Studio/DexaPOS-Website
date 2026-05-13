"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Site } from "@/types/site";
import { StorefrontMenu, StorefrontItem } from "@/types/storefront";
import { StorefrontHeader } from "../StorefrontHeader";
import { AccountDrawer } from "../AccountDrawer";
import { OrdersSheet } from "../OrdersSheet";
import { OrderStatusWatcher } from "../OrderStatusWatcher";
import { MobileBottomTabs, TabType } from "../MobileBottomTabs";
import { OrdersPanel } from "../OrdersPanel";
import { ItemDetailsModal } from "../ItemDetailsModal";
import { useCart } from "../../hooks/useCart";
import { useSession } from "../../hooks/useSession";
import { useSessionInit } from "../../hooks/useSessionInit";
import { useStorefrontPath } from "../../lib/use-storefront-path";
import { MenuSearch } from "../MenuSearch";
import { motion, AnimatePresence } from "motion/react";
import { Plus, ChevronUp, SlidersHorizontal, LayoutGrid, LayoutList } from "lucide-react";

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
}

type SortOption = "default" | "price_asc" | "price_desc" | "name";
type ViewMode = "grid" | "list";

function isValidImageSrc(src?: string | null): boolean {
  return !!src && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/"));
}

const POPULAR_TAGS = ["Popular", "New", "Vegan", "Gluten-Free", "Spicy"];

export function MarketLayout({ site, location, menus, slug }: MarketLayoutProps) {
  useSessionInit(site?.id);
  const router = useRouter();
  const activeOrderId = useSession((s) => s.activeOrderId);
  const storefrontPath = useStorefrontPath(slug);

  const [activeTab, setActiveTab] = useState<TabType>("menu");
  const [isOrdersSheetOpen, setIsOrdersSheetOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [showWelcomeDrawer, setShowWelcomeDrawer] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(56);

  const [activeMenuId, setActiveMenuId] = useState<string>(() => menus[0]?.id ?? "");
  const [activeCategory, setActiveCategory] = useState<string>("__all__");
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

  const itemsInCategory = useMemo(() => {
    if (activeCategory === "__all__") return allItems;
    return allCategories.find((c) => c.id === activeCategory)?.items ?? [];
  }, [activeCategory, allItems, allCategories]);

  const filteredItems = useMemo(() => {
    let items = itemsInCategory;
    if (activeTag === "Popular") items = items.filter((i) => i.is_popular);
    else if (activeTag === "New") items = items.filter((i) => i.is_new);
    else if (activeTag) items = items.filter((i) => (i.dietary_tags || []).some((t) => t.toLowerCase().includes(activeTag.toLowerCase())));

    switch (sortOption) {
      case "price_asc": return [...items].sort((a, b) => a.delivery_price - b.delivery_price);
      case "price_desc": return [...items].sort((a, b) => b.delivery_price - a.delivery_price);
      case "name": return [...items].sort((a, b) => a.name.localeCompare(b.name));
      default: return items;
    }
  }, [itemsInCategory, sortOption, activeTag]);

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
    const counts: Record<string, number> = { __all__: allItems.length };
    allCategories.forEach((c) => { counts[c.id] = c.items.length; });
    return counts;
  }, [allItems, allCategories]);

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
                <nav className="space-y-0.5">
                  {[{ id: "__all__", name: "All Items" }, ...allCategories].map((cat) => {
                    const isActive = activeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveCategory(cat.id)}
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
              {/* Mobile search */}
              <div className="lg:hidden mb-3">
                <MenuSearch
                  menus={menus}
                  variant="bar"
                  placeholder="Search menu…"
                  onResultClick={handleItemClick}
                />
              </div>

              {/* Mobile category pills */}
              <div className="lg:hidden overflow-x-auto pb-2 mb-4" style={{ scrollbarWidth: "none" }}>
                <div className="flex gap-2">
                  {[{ id: "__all__", name: "All" }, ...allCategories].map((cat) => {
                    const isActive = activeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveCategory(cat.id)}
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

              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm" style={{ color: "#6B7280" }}>
                  {activeCategory === "__all__"
                    ? `${filteredItems.length} item${filteredItems.length !== 1 ? "s" : ""}`
                    : `${filteredItems.length} item${filteredItems.length !== 1 ? "s" : ""} in ${allCategories.find((c) => c.id === activeCategory)?.name ?? ""}`
                  }
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
                    onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border transition-colors"
                    style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", color: "#6B7280" }}
                  >
                    {viewMode === "grid" ? <LayoutList className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Item grid / list */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeCategory}-${sortOption}-${viewMode}-${activeTag}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeCategory === "__all__" ? (
                    /* Show all categories with section headers */
                    (() => {
                      const sectionsWithItems = allCategories
                        .map((cat) => {
                          let items = cat.items;
                          if (activeTag === "Popular") items = items.filter((i) => i.is_popular);
                          else if (activeTag === "New") items = items.filter((i) => i.is_new);
                          else if (activeTag) items = items.filter((i) => (i.dietary_tags || []).some((t) => t.toLowerCase().includes(activeTag.toLowerCase())));
                          switch (sortOption) {
                            case "price_asc": items = [...items].sort((a, b) => a.delivery_price - b.delivery_price); break;
                            case "price_desc": items = [...items].sort((a, b) => b.delivery_price - a.delivery_price); break;
                            case "name": items = [...items].sort((a, b) => a.name.localeCompare(b.name)); break;
                          }
                          return { cat, items };
                        })
                        .filter(({ items }) => items.length > 0);

                      if (sectionsWithItems.length === 0) {
                        return (
                          <div className="flex flex-col items-center justify-center py-20 text-center">
                            <p className="text-lg font-semibold" style={{ color: "#111827" }}>No items found</p>
                            <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Try a different tag or sort</p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-10">
                          {sectionsWithItems.map(({ cat, items }) => (
                            <section key={cat.id}>
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
                      );
                    })()
                  ) : (
                    /* Single category — flat grid */
                    <>
                      {filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                          <p className="text-lg font-semibold" style={{ color: "#111827" }}>No items found</p>
                          <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Try a different tag or sort</p>
                        </div>
                      ) : (
                        <div className={viewMode === "grid" ? "grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-3"}>
                          {filteredItems.map((item) => (
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
                      )}
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
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
          <span className="font-semibold text-sm" style={{ color: "#111827" }}>${item.delivery_price.toFixed(2)}</span>
          {!isSoldOut && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-all"
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
          <span className="font-semibold text-sm" style={{ color: "#111827" }}>${item.delivery_price.toFixed(2)}</span>
          {!isSoldOut && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-all"
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
