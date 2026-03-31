"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UtensilsCrossed,
  Info,
  ClipboardList,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "../hooks/useCart";

export type TabType = "menu" | "info" | "orders" | "cart" | "account";

interface MobileBottomTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "menu", label: "Menu", icon: UtensilsCrossed },
  { id: "info", label: "Info", icon: Info },
  { id: "orders", label: "Order History", icon: ClipboardList },
  { id: "account", label: "Account", icon: User },
];

export function MobileBottomTabs({
  activeTab,
  onTabChange,
}: MobileBottomTabsProps) {
  const { getTotalItems } = useCart();
  const [mounted, setMounted] = useState(false);
  const itemCount = getTotalItems();
  useEffect(() => setMounted(true), []);
  const displayCount = mounted ? itemCount : 0;

  return (
    <nav id="mobile-bottom-tabs" className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
      <div
        className="absolute inset-0 backdrop-blur-xl"
        style={{
          backgroundColor: "color-mix(in srgb, var(--bg) 85%, transparent)",
          borderTop: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
        }}
      />

      <div className="absolute -top-4 left-0 right-0 h-4 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />

      <div className="relative flex items-center justify-around px-2 pb-safe">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const showBadge = tab.id === "cart" && displayCount > 0;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 py-3 px-4 min-w-[64px] transition-all duration-300",
                isActive ? "scale-105" : "scale-100"
              )}
            >
              {/* Active indicator pill */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: "spring", damping: 20, stiffness: 300 }}
                    className="absolute inset-x-2 top-1 bottom-1 bg-[var(--primary)]/10 dark:bg-[var(--primary)]/20 rounded-2xl -z-10"
                  />
                )}
              </AnimatePresence>

              {/* Icon with badge */}
              <div className="relative">
                <motion.div
                  animate={{
                    scale: isActive ? 1 : 0.95,
                  }}
                  transition={{ type: "spring", damping: 15, stiffness: 300 }}
                >
                  <Icon
                    className="h-6 w-6 transition-colors duration-300"
                    style={{
                      color: isActive
                        ? "var(--primary)"
                        : "var(--text-secondary)",
                    }}
                  />
                </motion.div>

                {/* Cart badge */}
                {showBadge && (
                  <motion.span
                    key={displayCount}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute -top-2 -right-2 flex items-center justify-center h-5 w-5 text-[10px] font-bold text-white bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] rounded-full shadow-lg shadow-[var(--primary)]/30"
                  >
                    {displayCount > 9 ? "9+" : displayCount}
                  </motion.span>
                )}
              </div>

              {/* Label */}
              <span
                className="text-[11px] font-semibold tracking-wide transition-colors duration-300"
                style={{
                  color: isActive
                    ? "var(--primary)"
                    : "var(--text-secondary)",
                }}
              >
                {tab.label}
              </span>

              {/* Active dot indicator */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: "spring", damping: 20, stiffness: 400 }}
                    className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-[var(--primary)]"
                  />
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
