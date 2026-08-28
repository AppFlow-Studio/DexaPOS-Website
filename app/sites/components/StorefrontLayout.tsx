"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Site } from "@/types/site";
import { StorefrontMenu } from "@/types/storefront";
import { MobileBottomTabs, TabType } from "./MobileBottomTabs";
import { MenuBrowser } from "./MenuBrowser";
import { OrdersPanel } from "./OrdersPanel";
import { OrdersSheet } from "./OrdersSheet";
import { StorefrontHeader } from "./StorefrontHeader";
import { HeroBanner } from "./HeroBanner";
import { BranchStorySection } from "./BranchStorySection";
import { StoreInfoBar, getTodayHoursString, isStoreOpenNow } from "./StoreInfoBar";
import { AccountDrawer } from "./AccountDrawer";
import { QrTableBanner } from "./QrTableBanner";
import { useCart } from "../hooks/useCart";
import { useSessionInit } from "../hooks/useSessionInit";
import { useQrFunnelTracking } from "../hooks/useQrFunnelTracking";
import { useSession } from "../hooks/useSession";
import { useStorefrontPath } from "../lib/use-storefront-path";
import { OrderStatusWatcher } from "./OrderStatusWatcher";
import { motion, AnimatePresence } from "motion/react";
import { ChevronUp } from "lucide-react";
import { SiteThemeConfig } from "@/types/site";
import { HeroLayout } from "./templates/HeroLayout";
import { MarketLayout } from "./templates/MarketLayout";
import { BoutiqueLayout } from "./templates/BoutiqueLayout";

interface StorefrontLayoutProps {
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

export function StorefrontLayout({
  site,
  location,
  menus,
  slug,
  seedQrSession,
}: StorefrontLayoutProps) {
  const templateId: SiteThemeConfig["templateId"] =
    site?.theme_config?.templateId || "classic";

  // Delegate to dedicated layout components for new templates
  if (templateId === "hero") {
    return (
      <HeroLayout
        site={site}
        location={location}
        menus={menus}
        slug={slug}
        seedQrSession={seedQrSession}
      />
    );
  }
  if (templateId === "market") {
    return (
      <MarketLayout
        site={site}
        location={location}
        menus={menus}
        slug={slug}
        seedQrSession={seedQrSession}
      />
    );
  }
  if (templateId === "boutique") {
    return (
      <BoutiqueLayout
        site={site}
        location={location}
        menus={menus}
        slug={slug}
        seedQrSession={seedQrSession}
      />
    );
  }

  // Classic is the default and fallback layout.
  return (
    <ClassicLayout
      site={site}
      location={location}
      menus={menus}
      slug={slug}
      seedQrSession={seedQrSession}
    />
  );
}

function ClassicLayout({
  site,
  location,
  menus,
  slug,
  seedQrSession,
}: StorefrontLayoutProps) {
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

  useQrFunnelTracking({
    trackMenuViewed: activeTab === "menu",
    trackCartStarted: true,
  });

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const { setOpen } = useCart();

  const rawBusinessHours =
    site?.online_ordering_config?.operatingHours ||
    (location as any).business_hours;

  const locationTimezone = (location as any).timezone ?? null;

  const todayHours = useMemo(
    () => getTodayHoursString(rawBusinessHours, locationTimezone),
    [rawBusinessHours, locationTimezone]
  );

  const isStoreOpen = useMemo(
    () => isStoreOpenNow(rawBusinessHours, locationTimezone),
    [rawBusinessHours, locationTimezone]
  );

  const handleTabChange = (tab: TabType) => {
    if (tab === "cart") {
      setOpen(true);
      return;
    }
    if (tab === "account") {
      setIsAccountOpen(true);
      return;
    }
    if (tab === "info") {
      router.push(storefrontPath("/info"));
      return;
    }
    setActiveTab(tab);
  };

  const menuLayout = site?.online_ordering_config?.menuLayout ?? "cards";

  const mainContainerClass = "container mx-auto px-4 py-6 lg:pb-8 pb-6";

  const renderContent = () => {
    switch (activeTab) {
      case "orders":
        return <OrdersPanel slug={slug} storeConfigId={site?.id} />;
      default:
        return (
          <MenuBrowser menus={menus} menuLayout={menuLayout} />
        );
    }
  };

  return (
    <>
      <OrderStatusWatcher orderId={activeOrderId} />

      <StorefrontHeader
        site={site}
        storeConfigId={site?.id}
        onInfoClick={() => router.push(storefrontPath("/info"))}
        onOrdersClick={() => setIsOrdersSheetOpen(true)}
        onAccountClick={() => setIsAccountOpen(true)}
        onAuthSuccess={() => {
          setShowWelcomeDrawer(true);
          setIsAccountOpen(true);
        }}
      />

      {activeTab === "menu" && (
        <div id="storefront-hero">
          {/* Hero — photo only, no text overlay */}
          <HeroBanner site={site} />

          {/* Info strip — name, address, hours, fulfillment toggle, CTA */}
          <StoreInfoBar
            site={site}
            location={location}
            isStoreOpen={isStoreOpen}
            todayHours={todayHours}
          />

          {/* Story / description section */}
          <div className="container mx-auto px-4 mt-4">
            <QrTableBanner tableLabel={qrTableLabel} className="mb-4" />
            <BranchStorySection site={site} />
          </div>
        </div>
      )}

      <main id="storefront-menu" className={mainContainerClass}>
        {renderContent()}
      </main>

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
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-text)",
            }}
            aria-label="Scroll to top"
          >
            <ChevronUp className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
