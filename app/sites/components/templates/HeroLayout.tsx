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
import { getTodayHoursString, isStoreOpenNow } from "../StoreInfoBar";
import { MenuSearch } from "../MenuSearch";
import {
  getStorefrontBrowsePrice,
  getStorefrontDeliveryPriceLabel,
} from "../../lib/storefront-pricing";
import { motion, AnimatePresence } from "motion/react";
import { Plus, ChevronUp, Clock } from "lucide-react";

interface HeroLayoutProps {
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

export function HeroLayout({
  site,
  location,
  menus,
  slug,
  seedQrSession,
}: HeroLayoutProps) {
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

  const { setOpen: setCartOpen, pendingModalItem, clearPendingModalItem } = useCart();

  const rawBusinessHours = site?.online_ordering_config?.operatingHours || (location as any).business_hours;
  const todayHours = useMemo(() => getTodayHoursString(rawBusinessHours), [rawBusinessHours]);
  const isStoreOpen = useMemo(() => isStoreOpenNow(rawBusinessHours), [rawBusinessHours]);

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

  useEffect(() => {
    if (activeMenu?.categories?.length) setActiveCategory(activeMenu.categories[0].id);
  }, [activeMenu]);

  const allCategories = activeMenu?.categories ?? [];

  // IntersectionObserver for active category highlighting
  useEffect(() => {
    if (!allCategories.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = e.target.getAttribute("id")?.replace("hero-category-", "");
            if (id) setActiveCategory(id);
          }
        }
      },
      { rootMargin: `-${headerHeight + 60}px 0px -60% 0px`, threshold: 0 }
    );
    allCategories.forEach((c) => {
      const el = document.getElementById(`hero-category-${c.id}`);
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
    const el = document.getElementById(`hero-category-${categoryId}`);
    if (el) {
      const offset = headerHeight + 56 + 8;
      const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const handleTabChange = (tab: TabType) => {
    if (tab === "cart") { setCartOpen(true); return; }
    if (tab === "account") { setIsAccountOpen(true); return; }
    if (tab === "info") { router.push(storefrontPath("/info")); return; }
    setActiveTab(tab);
  };

  const heroImage = site?.theme_config?.heroImageUrl;
  const storeName = site?.title || location.name;

  return (
    <>
      <OrderStatusWatcher orderId={activeOrderId} />

      {/* Shared header */}
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
          {/* Hero Banner — 250px */}
          <div
            className="relative flex items-end"
            style={{
              height: 250,
              background: heroImage
                ? `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url(${heroImage}) center/cover no-repeat`
                : "linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 70%, #000) 100%)",
            }}
          >
            <div className="container mx-auto px-6 pb-6 text-white">
              <h1 className="text-4xl font-bold mb-1" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>
                {storeName}
              </h1>
              {todayHours && (
                <p className="flex items-center gap-1.5 text-sm opacity-90">
                  <Clock className="h-4 w-4" />
                  {todayHours}
                </p>
              )}
            </div>
          </div>

          {/* Sticky nav: menu tabs (if >1) + category pills + search */}
          <div
            className="z-40 border-b"
            style={{
              position: "sticky",
              top: headerHeight,
              backgroundColor: "#FFFFFF",
              borderColor: "#E5E5E5",
              boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
            }}
          >
            {/* Menu tabs row — only when multiple menus */}
            {menus.length > 1 && (
              <div className="container mx-auto px-4 border-b" style={{ borderColor: "#E5E5E5" }}>
                <div className="flex overflow-x-auto gap-1" style={{ scrollbarWidth: "none" }}>
                  {menus.map((menu) => {
                    const isActive = activeMenuId === menu.id;
                    return (
                      <button
                        key={menu.id}
                        type="button"
                        onClick={() => setActiveMenuId(menu.id)}
                        className="px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px shrink-0 uppercase tracking-wide"
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

            {/* Category nav + search */}
            <div className="container mx-auto px-4 flex items-center gap-2">
              <nav className="flex overflow-x-auto py-3 gap-6 flex-1 min-w-0" style={{ scrollbarWidth: "none" }}>
                {allCategories.map((cat) => {
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => scrollToCategory(cat.id)}
                      className="relative text-sm font-medium whitespace-nowrap transition-colors pb-1 shrink-0"
                      style={{ color: isActive ? "var(--primary)" : "#666666" }}
                    >
                      {cat.name}
                      {isActive && (
                        <span
                          className="absolute bottom-0 left-0 w-full h-0.5 rounded-full"
                          style={{ backgroundColor: "var(--primary)" }}
                        />
                      )}
                    </button>
                  );
                })}
              </nav>
              <div className="shrink-0 py-2">
                <MenuSearch
                  menus={menus}
                  variant="icon"
                  onResultClick={(item) => { handleItemClick(item); }}
                />
              </div>
            </div>
          </div>

          {/* Menu content */}
          <main className="container mx-auto px-4 py-8 pb-32 lg:pb-8">
            <QrTableBanner tableLabel={qrTableLabel} className="mb-6" />
            {allCategories.map((category) => (
              <section key={category.id} id={`hero-category-${category.id}`} className="mb-12 scroll-mt-32">
                <h2 className="text-2xl font-bold mb-5" style={{ color: "var(--primary)" }}>
                  {category.name}
                </h2>
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))" }}>
                  {category.items.map((item) => (
                    <HeroItemCard
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
          </main>
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

function HeroItemCard({
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

  const handleEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
    e.currentTarget.style.borderColor = "#D1D1D1";
    e.currentTarget.style.transform = "translateY(-2px)";
  };
  const handleLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.boxShadow = "";
    e.currentTarget.style.borderColor = "#E5E5E5";
    e.currentTarget.style.transform = "translateY(0)";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      onClick={isSoldOut ? undefined : onClick}
      onMouseEnter={isSoldOut ? undefined : handleEnter}
      onMouseLeave={isSoldOut ? undefined : handleLeave}
      className={`group flex gap-3 p-4 rounded-xl border transition-all duration-200 ${isSoldOut ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: "var(--radius)" }}
    >
      {/* Content left */}
      <div className="flex-1 flex flex-col justify-between min-w-0">
        <div>
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-[color:var(--primary)] transition-colors" style={{ color: "#1A1A1A" }}>
                {item.name}
              </h4>
              <span className="text-sm font-semibold shrink-0 px-2 py-0.5 rounded-md" style={{ backgroundColor: "#F8F9FA", color: "#1A1A1A" }}>
              ${getStorefrontBrowsePrice(item).toFixed(2)}
              </span>
            </div>
            {item.description && (
              <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: "#666666" }}>
                {item.description}
              </p>
            )}
            {getStorefrontDeliveryPriceLabel(item) && (
              <p className="text-[10px] mt-1" style={{ color: "#6B7280" }}>
                {getStorefrontDeliveryPriceLabel(item)}
              </p>
            )}
        </div>
        <div className="mt-3">
          {isSoldOut ? (
            <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}>
              Sold Out
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 group-hover:scale-105"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
              aria-label={`Add ${item.name} to cart`}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Image right — 100×100 */}
      <div className="shrink-0 w-24 h-24 rounded-lg overflow-hidden relative" style={{ backgroundColor: "#F3F4F6" }}>
        {showImage ? (
          <Image
            src={item.image!}
            fill
            alt={item.name}
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="96px"
            onError={() => onImageError(item.id)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-2xl font-bold" style={{ color: "var(--primary)", opacity: 0.25 }}>
              {item.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
