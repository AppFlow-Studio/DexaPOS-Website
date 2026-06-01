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
import { Plus, ChevronUp, ShoppingBag, Tag } from "lucide-react";

const POPULAR_TAGS = ["Popular", "New", "Vegan", "Gluten-Free", "Spicy"];

interface BoutiqueLayoutProps {
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

function isValidImageSrc(src?: string | null): boolean {
  return !!src && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/"));
}

export function BoutiqueLayout({
  site,
  location,
  menus,
  slug,
  seedQrSession,
}: BoutiqueLayoutProps) {
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
  const [selectedItem, setSelectedItem] = useState<StorefrontItem | null>(null);
  const [selectedCategoryItems, setSelectedCategoryItems] = useState<StorefrontItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const { setOpen: setCartOpen, items: cartItems, pendingModalItem, clearPendingModalItem } = useCart();
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

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

  const allItems = useMemo(
    () => allCategories.flatMap((c) => c.items),
    [allCategories]
  );

  const activeTags = useMemo(
    () =>
      POPULAR_TAGS.filter((tag) => {
        if (tag === "Popular") return allItems.some((i) => i.is_popular);
        if (tag === "New") return allItems.some((i) => i.is_new);
        return allItems.some((i) =>
          (i.dietary_tags || []).some((t) => t.toLowerCase().includes(tag.toLowerCase()))
        );
      }),
    [allItems]
  );

  const filterItems = useCallback(
    (items: StorefrontItem[]) => {
      if (!activeTag) return items;
      if (activeTag === "Popular") return items.filter((i) => i.is_popular);
      if (activeTag === "New") return items.filter((i) => i.is_new);
      return items.filter((i) =>
        (i.dietary_tags || []).some((t) => t.toLowerCase().includes(activeTag.toLowerCase()))
      );
    },
    [activeTag]
  );
  useEffect(() => {
    if (allCategories.length) setActiveCategory(allCategories[0].id);
  }, [activeMenu]);

  // IntersectionObserver to track active category as user scrolls
  useEffect(() => {
    if (!allCategories.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = e.target.getAttribute("id")?.replace("boutique-cat-", "");
            if (id) setActiveCategory(id);
          }
        }
      },
      { rootMargin: `-${headerHeight + 16}px 0px -60% 0px`, threshold: 0 }
    );
    allCategories.forEach((c) => {
      const el = document.getElementById(`boutique-cat-${c.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [allCategories, headerHeight]);

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

  const scrollToCategory = (categoryId: string) => {
    setActiveCategory(categoryId);
    const el = document.getElementById(`boutique-cat-${categoryId}`);
    if (el) {
      const top = el.getBoundingClientRect().top + window.pageYOffset - headerHeight - 16;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const handleTabChange = (tab: TabType) => {
    if (tab === "cart") { setCartOpen(true); return; }
    if (tab === "account") { setIsAccountOpen(true); return; }
    if (tab === "info") { router.push(storefrontPath("/info")); return; }
    setActiveTab(tab);
  };

  const storeName = site?.title || location.name;
  const heroImage = site?.theme_config?.heroImageUrl;

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
        <div className="flex" style={{ minHeight: "100vh" }}>
          {/* 320px sticky side-nav — desktop only */}
          <nav
            className="hidden lg:flex flex-col shrink-0 border-r"
            style={{
              width: 320,
              position: "sticky",
              top: headerHeight,
              height: `calc(100vh - ${headerHeight}px)`,
              backgroundColor: "#FFFFFF",
              borderColor: "#E5E7EB",
              overflowY: "auto",
            }}
          >
            {/* Brand */}
            <div className="px-8 py-8 border-b" style={{ borderColor: "#E5E7EB" }}>
              <h1
                className="text-2xl font-bold leading-tight"
                style={{ color: "var(--primary)", fontFamily: "var(--font-display)" }}
              >
                {storeName}
              </h1>
              {location.address_line1 && (
                <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                  {location.address_line1}, {location.city}
                </p>
              )}
            </div>

            {/* Menu tabs — only when multiple menus */}
            {menus.length > 1 && (
              <div className="border-b" style={{ borderColor: "#E5E7EB" }}>
                {menus.map((menu) => {
                  const isActive = activeMenuId === menu.id;
                  return (
                    <button
                      key={menu.id}
                      type="button"
                      onClick={() => setActiveMenuId(menu.id)}
                      className="w-full flex items-center gap-3 px-8 py-3 text-left text-sm font-medium transition-all border-l-2"
                      style={{
                        borderColor: isActive ? "var(--primary)" : "transparent",
                        color: isActive ? "var(--primary)" : "#6B7280",
                        backgroundColor: isActive ? "color-mix(in srgb, var(--primary) 5%, #FFFFFF)" : "transparent",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {menu.name}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Search */}
            <div className="px-6 pt-5 pb-1">
              <MenuSearch
                menus={menus}
                variant="bar"
                placeholder="Search menu…"
                onResultClick={handleItemClick}
              />
            </div>

            {/* Numbered category links */}
            <div className="flex-1 py-4 px-6">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-4" style={{ color: "#9CA3AF" }}>
                Menu
              </p>
              <ol className="space-y-1">
                {allCategories.map((cat, idx) => {
                  const isActive = activeCategory === cat.id;
                  return (
                    <li key={cat.id}>
                      <button
                        type="button"
                        onClick={() => scrollToCategory(cat.id)}
                        className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left transition-all"
                        style={{
                          backgroundColor: isActive ? "color-mix(in srgb, var(--primary) 8%, #FFFFFF)" : "transparent",
                          color: isActive ? "var(--primary)" : "#6B7280",
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        <span
                          className="text-xs font-bold w-6 shrink-0 text-center"
                          style={{ color: isActive ? "var(--primary)" : "#D1D5DB" }}
                        >
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="text-sm">{cat.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Tag filters */}
            {activeTags.length > 0 && (
              <div className="px-6 pb-4 border-t pt-4" style={{ borderColor: "#E5E7EB" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: "#9CA3AF" }}>
                  <Tag className="h-3 w-3" />
                  Filter
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeTags.map((tag) => {
                    const isActive = activeTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setActiveTag(isActive ? null : tag)}
                        className="px-3 py-1 rounded-full text-xs font-medium transition-all"
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
            {/* Persistent View Cart CTA */}
            <div className="p-6 border-t" style={{ borderColor: "#E5E7EB" }}>
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
              >
                <ShoppingBag className="h-4 w-4" />
                View Cart
                {cartCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "rgba(255,255,255,0.25)" }}>
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </nav>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="px-6 lg:px-10 pt-6">
              <QrTableBanner tableLabel={qrTableLabel} />
            </div>
            {/* 400px hero banner */}
            <div
              className="relative"
              style={{
                height: 400,
                background: heroImage
                  ? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url(${heroImage}) center/cover no-repeat`
                  : "linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 60%, #000) 100%)",
              }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-6">
                <h2
                  className="text-4xl lg:text-5xl font-bold mb-3"
                  style={{ fontFamily: "var(--font-display)", textShadow: "0 2px 16px rgba(0,0,0,0.3)" }}
                >
                  {storeName}
                </h2>
                <p className="text-base opacity-85 max-w-md">
                  {site?.description || "Order online for pickup or delivery"}
                </p>
              </div>
            </div>

            {/* Mobile search + category pills */}
            <div
              className="lg:hidden z-30 border-b px-4 pt-3 pb-2"
              style={{
                position: "sticky",
                top: headerHeight,
                backgroundColor: "#FFFFFF",
                borderColor: "#E5E7EB",
              }}
            >
              {/* Mobile menu tabs */}
              {menus.length > 1 && (
                <div className="overflow-x-auto mb-2 -mx-4 px-4 border-b pb-2" style={{ scrollbarWidth: "none", borderColor: "#E5E7EB" }}>
                  <div className="flex gap-1">
                    {menus.map((menu) => {
                      const isActive = activeMenuId === menu.id;
                      return (
                        <button
                          key={menu.id}
                          type="button"
                          onClick={() => setActiveMenuId(menu.id)}
                          className="px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-[9px] shrink-0 uppercase tracking-wide"
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
              <div className="mb-2">
                <MenuSearch
                  menus={menus}
                  variant="bar"
                  placeholder="Search menu…"
                  onResultClick={handleItemClick}
                />
              </div>
              <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                <div className="flex gap-2">
                  {allCategories.map((cat) => {
                    const isActive = activeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
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
              {activeTags.length > 0 && (
                <div className="overflow-x-auto pt-2 pb-1" style={{ scrollbarWidth: "none" }}>
                  <div className="flex gap-2">
                    {activeTags.map((tag) => {
                      const isActive = activeTag === tag;
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setActiveTag(isActive ? null : tag)}
                          className="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all"
                          style={{
                            backgroundColor: isActive ? "var(--primary)" : "#F3F4F6",
                            color: isActive ? "var(--primary-text)" : "#6B7280",
                            border: isActive ? `1px solid var(--primary)` : "1px solid #E5E7EB",
                          }}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Category sections */}
            <div className="px-6 lg:px-10 py-8 pb-32 lg:pb-12 space-y-16">
              {allCategories.map((category) => {
                const visibleItems = filterItems(category.items);
                if (visibleItems.length === 0) return null;
                return (
                  <section key={category.id} id={`boutique-cat-${category.id}`} className="scroll-mt-20">
                    <div className="mb-6">
                      <h2
                        className="text-3xl font-bold"
                        style={{ color: "var(--primary)", fontFamily: "var(--font-display)" }}
                      >
                        {category.name}
                      </h2>
                      <div className="mt-2 h-px w-16" style={{ backgroundColor: "var(--primary)", opacity: 0.3 }} />
                    </div>

                    {/* Vertical cards grid — image top, hover-reveal add */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                      {visibleItems.map((item) => (
                        <BoutiqueItemCard
                          key={item.id}
                          item={item}
                          failedImageIds={failedImageIds}
                          onImageError={handleImageError}
                          onClick={() => handleItemClick(item)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
              {activeTag && allCategories.every((c) => filterItems(c.items).length === 0) && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-lg font-semibold" style={{ color: "#111827" }}>No items found</p>
                  <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>No items match the selected filter</p>
                </div>
              )}
            </div>
          </div>
        </div>
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

function BoutiqueItemCard({
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
  const [hovered, setHovered] = useState(false);
  const isSoldOut = item.availability === false;
  const showImage = isValidImageSrc(item.image) && !failedImageIds.has(item.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      onClick={isSoldOut ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group flex flex-col overflow-hidden ${isSoldOut ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: "var(--radius)",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.10)" : "0 2px 8px rgba(0,0,0,0.04)",
        transform: hovered && !isSoldOut ? "translateY(-3px)" : "translateY(0)",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Image top */}
      <div className="w-full aspect-[4/3] relative overflow-hidden" style={{ backgroundColor: "#F3F4F6" }}>
        {showImage ? (
          <Image
            src={item.image!}
            fill
            alt={item.name}
            className="object-cover transition-transform duration-700"
            style={{ transform: hovered ? "scale(1.06)" : "scale(1)" }}
            sizes="(max-width: 640px) 100vw, 33vw"
            onError={() => onImageError(item.id)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span
              className="text-4xl font-bold"
              style={{ color: "var(--primary)", fontFamily: "var(--font-display)", opacity: 0.2 }}
            >
              {item.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.75)" }}>
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}>Sold Out</span>
          </div>
        )}
        {/* Hover-reveal add button */}
        <AnimatePresence>
          {hovered && !isSoldOut && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              type="button"
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="absolute bottom-3 right-3 w-10 h-10 flex items-center justify-center rounded-full shadow-lg"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
              aria-label={`Add ${item.name} to cart`}
            >
              <Plus className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        {(item.is_new || item.is_popular) && (
          <div className="flex gap-1 mb-2">
            {item.is_new && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border" style={{ color: "var(--primary)", borderColor: "var(--primary)" }}>New</span>
            )}
            {item.is_popular && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>Popular</span>
            )}
          </div>
        )}
        <h4
          className="font-semibold text-base leading-tight line-clamp-2 mb-1"
          style={{ color: "#1A1A1A", fontFamily: "var(--font-display)" }}
        >
          {item.name}
        </h4>
        {item.description && (
          <p className="text-xs line-clamp-2 flex-1 mb-3" style={{ color: "#6B7280" }}>
            {item.description}
          </p>
        )}
        <span className="font-semibold text-base mt-auto" style={{ color: "var(--primary)" }}>
          ${getStorefrontBrowsePrice(item).toFixed(2)}
        </span>
        {getStorefrontDeliveryPriceLabel(item) && (
          <span className="text-[10px] mt-1" style={{ color: "#6B7280" }}>
            {getStorefrontDeliveryPriceLabel(item)}
          </span>
        )}
      </div>
    </motion.div>
  );
}
