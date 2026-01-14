"use client";

import { useState } from "react";
import { Site } from "@/types/site";
import { StorefrontMenu } from "@/types/storefront";
import { MobileBottomTabs, TabType } from "./MobileBottomTabs";
import { MenuBrowser } from "./MenuBrowser";
import { InfoPanel } from "./InfoPanel";
import { OrdersPanel } from "./OrdersPanel";
import { InfoSheet } from "./InfoSheet";
import { OrdersSheet } from "./OrdersSheet";
import { StorefrontHeader } from "./StorefrontHeader";
import { HeroBanner } from "./HeroBanner";
import { StoreInfoBar } from "./StoreInfoBar";
import { useCart } from "../hooks/useCart";
import { motion, AnimatePresence } from "framer-motion";

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
  };
  menus: StorefrontMenu[];
}

export function StorefrontLayout({
  site,
  location,
  menus,
}: StorefrontLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabType>("menu");
  const [isInfoSheetOpen, setIsInfoSheetOpen] = useState(false);
  const [isOrdersSheetOpen, setIsOrdersSheetOpen] = useState(false);
  const { setOpen } = useCart();

  const storeName = site?.title || location.name || "Store";

  const handleTabChange = (tab: TabType) => {
    if (tab === "cart") {
      // Open the cart sidebar instead of switching tabs
      setOpen(true);
      return;
    }
    setActiveTab(tab);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "menu":
        return <MenuBrowser menus={menus} />;
      case "info":
        return <InfoPanel site={site} location={location} />;
      case "orders":
        return <OrdersPanel />;
      default:
        return <MenuBrowser menus={menus} />;
    }
  };

  return (
    <>
      {/* Header with desktop navigation callbacks */}
      <StorefrontHeader
        site={site}
        location={location}
        onInfoClick={() => setIsInfoSheetOpen(true)}
        onOrdersClick={() => setIsOrdersSheetOpen(true)}
      />

      {/* Hero Banner - Only show on Menu tab */}
      <AnimatePresence mode="wait">
        {activeTab === "menu" && (
          <motion.div
            key="hero-banner"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <HeroBanner site={site} storeName={storeName} />
            {/* Store Info Bar - below hero */}
            <StoreInfoBar site={site} location={location} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="container mx-auto p-4 py-6 lg:pb-8 pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Tabs */}
      <MobileBottomTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Desktop Side Sheets */}
      <InfoSheet
        isOpen={isInfoSheetOpen}
        onOpenChange={setIsInfoSheetOpen}
        site={site}
        location={location}
      />
      <OrdersSheet
        isOpen={isOrdersSheetOpen}
        onOpenChange={setIsOrdersSheetOpen}
      />
    </>
  );
}
