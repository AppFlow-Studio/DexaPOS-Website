"use client";

import { useState, useEffect } from "react";
import { Site } from "@/types/site";
import { ShoppingBag, Info, ClipboardList, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "../hooks/useCart";
import { useSession } from "../hooks/useSession";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AuthDialog } from "./AuthDialog";

interface StorefrontHeaderProps {
  site: Site | null;
  storeConfigId?: string;
  onInfoClick?: () => void;
  onOrdersClick?: () => void;
  onAccountClick?: () => void;
  onAuthSuccess?: () => void;
}

export function StorefrontHeader({
  site,
  storeConfigId,
  onInfoClick,
  onOrdersClick,
  onAccountClick,
  onAuthSuccess,
}: StorefrontHeaderProps) {
  const { toggleCart, getTotalItems } = useCart();
  const { isAuthenticated, customer } = useSession();
  const [showAuth, setShowAuth] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const itemCount = getTotalItems();
  const displayCount = mounted ? itemCount : 0;

  useEffect(() => setMounted(true), []);

  // Frosted-glass header once the page scrolls, so content passing underneath
  // doesn't butt straight against it. At the top it stays flat and borderless.
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const initials = customer?.name
    ? customer.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : null;

  const handleAccountClick = () => {
    if (isAuthenticated) {
      onAccountClick?.();
    } else {
      setShowAuth(true);
    }
  };

  return (
    <>
      <header
        id="storefront-header"
        className="sticky top-0 z-50 w-full"
        style={{
          backgroundColor: isScrolled ? "rgba(255, 255, 255, 0.72)" : "#FFFFFF",
          backdropFilter: isScrolled ? "blur(12px) saturate(180%)" : undefined,
          WebkitBackdropFilter: isScrolled ? "blur(12px) saturate(180%)" : undefined,
          boxShadow: isScrolled ? "0 1px 12px rgba(0, 0, 0, 0.06)" : undefined,
          transition: "background-color .25s ease, box-shadow .25s ease",
          fontFamily: "var(--font)",
        }}
      >
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          {/* Logo — left */}
          <div className="flex items-center">
            {site?.logo_url ? (
              <img
                src={site.logo_url}
                alt={site?.title || "Store"}
                className="h-14 w-14 rounded-lg object-contain"
              />
            ) : (
              <div
                className="h-14 w-14 flex items-center justify-center rounded-lg font-bold text-lg"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--primary) 10%, #FFFFFF)",
                  color: "var(--primary)",
                }}
              >
                {(site?.title || "S").charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Utility icons — right */}
          <div className="flex items-center gap-0.5">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onInfoClick}
                    variant="ghost"
                    size="icon"
                    className="rounded-full transition-colors hover:bg-gray-100"
                    style={{ color: "var(--primary)" }}
                  >
                    <Info className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Store Info</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onOrdersClick}
                    variant="ghost"
                    size="icon"
                    className="rounded-full transition-colors hover:bg-gray-100"
                    style={{ color: "var(--primary)" }}
                  >
                    <ClipboardList className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Order History</p>
                </TooltipContent>
              </Tooltip>

              <div className="w-px h-5 mx-1" style={{ backgroundColor: "#E5E7EB" }} />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleAccountClick}
                    variant="ghost"
                    size="icon"
                    className="rounded-full transition-colors relative hover:bg-gray-100"
                    style={{ color: "var(--primary)" }}
                  >
                    {isAuthenticated && initials ? (
                      <span className="text-xs font-bold">{initials}</span>
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{isAuthenticated ? "Account" : "Sign In"}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={toggleCart}
                    variant="ghost"
                    size="icon"
                    className="relative rounded-full transition-colors hover:bg-gray-100"
                    style={{ color: "var(--primary)" }}
                  >
                    <ShoppingBag className="h-5 w-5" />
                    {displayCount > 0 && (
                      <span
                        className="absolute -top-1 -right-1 text-[10px] font-bold h-5 w-5 flex items-center justify-center rounded-full border-2 border-white animate-in zoom-in duration-200"
                        style={{
                          backgroundColor: "var(--primary)",
                          color: "var(--primary-text)",
                        }}
                      >
                        {displayCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Your Cart {displayCount > 0 ? `(${displayCount})` : ""}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </header>

      <AuthDialog
        isOpen={showAuth}
        onOpenChange={setShowAuth}
        storeConfigId={storeConfigId ?? ""}
        onSuccess={onAuthSuccess}
      />
    </>
  );
}
