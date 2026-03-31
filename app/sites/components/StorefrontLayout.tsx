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
import { useCart } from "../hooks/useCart";
import { useSessionInit } from "../hooks/useSessionInit";
<<<<<<< .merge_file_is9wWb
import { useStorefrontPath } from "../lib/use-storefront-path";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { SiteThemeConfig } from "@/types/site";
=======
import { motion, AnimatePresence } from "motion/react";
>>>>>>> .merge_file_kAO8uK

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
  };
  menus: StorefrontMenu[];
  slug: string;
}

export function StorefrontLayout({
  site,
  location,
  menus,
  slug,
}: StorefrontLayoutProps) {
  useSessionInit(site?.id);
  const router = useRouter();
  const storefrontPath = useStorefrontPath(slug);

  const [activeTab, setActiveTab] = useState<TabType>("menu");
  const [isOrdersSheetOpen, setIsOrdersSheetOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const { setOpen } = useCart();

  const storeName = site?.title || location.name || "Store";
  const templateId: SiteThemeConfig["templateId"] =
    site?.theme_config?.templateId || "classic";

  const pickupEnabled = site?.online_ordering_config?.pickupEnabled !== false;
  const deliveryEnabled = site?.online_ordering_config?.deliveryEnabled === true;

  const rawBusinessHours =
    site?.online_ordering_config?.operatingHours ||
    (location as any).business_hours;

  const todayHours = useMemo(
    () => getTodayHoursString(rawBusinessHours),
    [rawBusinessHours]
  );

  const isStoreOpen = useMemo(
    () => isStoreOpenNow(rawBusinessHours),
    [rawBusinessHours]
  );

  const prepTime = site?.online_ordering_config?.preparationLeadTime ?? null;

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

  const mainContainerClass =
    templateId === "minimal"
      ? "mx-auto max-w-3xl px-4 sm:px-6 py-6 lg:pb-8 pb-24"
      : "container mx-auto px-4 py-6 lg:pb-8 pb-24";

  const renderContent = () => {
    switch (activeTab) {
      case "orders":
        return <OrdersPanel slug={slug} storeConfigId={site?.id} />;
      default:
        return (
          <MenuBrowser
            menus={menus}
            menuLayout={menuLayout}
            templateId={templateId || "classic"}
          />
        );
    }
  };

  return (
    <>
      {/* Header with desktop navigation callbacks */}
      <StorefrontHeader
        site={site}
        location={location}
        storeConfigId={site?.id}
        todayHours={todayHours}
        forceFilledHeader={activeTab === "orders"}
        onInfoClick={() => router.push(storefrontPath("/info"))}
        onOrdersClick={() => setIsOrdersSheetOpen(true)}
        onAccountClick={() => setIsAccountOpen(true)}
      />

      {/* Hero & upper chrome — plain div, no motion wrapper to avoid stacking context conflict with sticky menu nav */}
      {activeTab === "menu" && (
        <div id="storefront-hero">
          <HeroBanner
            site={site}
            storeName={storeName}
            locationAddress={`${location.address_line1}, ${location.city}`}
            isStoreOpen={isStoreOpen}
            prepTime={prepTime}
            pickupEnabled={pickupEnabled}
            deliveryEnabled={deliveryEnabled}
          />

          {/* Story section — normal flow below hero */}
          {templateId === "classic" && (
            <div className="container mx-auto px-4 mt-4">
              <BranchStorySection site={site} />
            </div>
          )}
          {templateId === "bold" && (
            <div className="container mx-auto px-4 mt-6 mb-2">
              <BranchStorySection site={site} />
            </div>
          )}
          {templateId === "minimal" && (
            <div className="max-w-3xl mx-auto px-4 mt-4">
              <BranchStorySection site={site} />
            </div>
          )}
        </div>
      )}

      {/* Main Content Area - Plain div avoids AnimatePresence hydration mismatch and lets sticky work */}
      <main id="storefront-menu" className={mainContainerClass}>
        {renderContent()}
      </main>

      {/* Mobile Bottom Tabs */}
      <MobileBottomTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Desktop Side Sheets */}
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
      />

      {/* Scroll-to-top — rendered at layout root to avoid inner stacking context issues */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-44 right-4 lg:bottom-8 z-[55] w-11 h-11 flex items-center justify-center rounded-full"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-text)",
              boxShadow: "0 4px 16px color-mix(in srgb, var(--primary) 45%, transparent)",
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
