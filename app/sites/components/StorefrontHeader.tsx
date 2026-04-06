"use client";

import { useState, useEffect } from "react";
import { Site } from "@/types/site";
import { ShoppingBag, Info, ClipboardList, User, MapPin, Clock, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "../hooks/useCart";
import { useSession } from "../hooks/useSession";
import { useDarkMode } from "../contexts/DarkModeContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AuthDialog } from "./AuthDialog";

interface StorefrontHeaderProps {
  site: Site | null;
  location: {
    name: string;
    address_line1: string;
    city: string;
  };
  storeConfigId?: string;
  todayHours?: string | null;
  forceFilledHeader?: boolean;
  onInfoClick?: () => void;
  onOrdersClick?: () => void;
  onAccountClick?: () => void;
  onAuthSuccess?: () => void;
}

export function StorefrontHeader({
  site,
  location,
  storeConfigId,
  todayHours,
  forceFilledHeader,
  onInfoClick,
  onOrdersClick,
  onAccountClick,
  onAuthSuccess,
}: StorefrontHeaderProps) {
  const { toggleCart, getTotalItems } = useCart();
  const { isAuthenticated, customer } = useSession();
  const { isDark, toggle: toggleDark } = useDarkMode();
  const [showAuth, setShowAuth] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const itemCount = getTotalItems();
  // Defer cart count to client so SSR and first client render match (cart is from localStorage).
  const displayCount = mounted ? itemCount : 0;
  const storeName = site?.title || location.name;

  // Respect site-configured header style, but avoid fully transparent
  // headers in the minimal template where the background is already light.
  const templateId = site?.theme_config?.templateId || "classic";
  const isMinimalTemplate = templateId === "minimal";
  const configuredHeaderStyle = site?.theme_config?.headerStyle || "filled";
  const forceOutlined = isMinimalTemplate && configuredHeaderStyle === "transparent";
  const forceNonTransparent = forceOutlined || !!forceFilledHeader;
  const headerStyle = forceOutlined ? "outlined" : forceFilledHeader ? "filled" : configuredHeaderStyle;
  const isTransparent = headerStyle === "transparent";

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!isTransparent) return;
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isTransparent]);

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

  const positionClass = isTransparent ? "fixed" : "sticky";

  const headerBg =
    isTransparent && scrolled
      ? "var(--primary)"
      : isTransparent && !scrolled
        ? "transparent"
        : headerStyle === "outlined"
          ? "var(--bg)"
          : "var(--header-bg)";

  const headerText =
    headerStyle === "outlined"
      ? "var(--text)"
      : isTransparent && !scrolled
        ? "#ffffff"
        : isTransparent && scrolled
          ? "var(--primary-text)"
          : "var(--header-text)";

  const shadow =
    isTransparent && !scrolled
      ? "none"
      : headerStyle === "outlined"
        ? "none"
        : "0 1px 8px rgba(0,0,0,0.08)";

  const dividerColor =
    headerStyle === "outlined"
      ? "var(--border)"
      : `color-mix(in srgb, ${headerText} 25%, transparent)`;

  const hoverBg =
    headerStyle === "outlined"
      ? "var(--border)"
      : `color-mix(in srgb, ${headerText} 12%, transparent)`;

  return (
    <>
      <header
        id="storefront-header"
        className={`${positionClass} top-0 z-50 w-full transition-all duration-300`}
        style={{
          backgroundColor: headerBg,
          backgroundImage:
            isTransparent && !scrolled
              ? "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%)"
              : undefined,
          color: headerText,
          fontFamily: "var(--font)",
          borderBottom:
            headerStyle === "outlined"
              ? "1px solid var(--header-border)"
              : "none",
          boxShadow: shadow,
          backdropFilter:
            isTransparent && scrolled ? "blur(16px)" : undefined,
        }}
      >
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            {site?.logo_url && (
              <img
                src={site.logo_url}
                alt={`${storeName} Logo`}
                className="h-11 w-11 rounded-full object-cover ring-2 shadow-sm"
                style={{
                  ringColor:
                    headerStyle === "outlined"
                      ? "var(--border)"
                      : `color-mix(in srgb, ${headerText} 20%, transparent)`,
                }}
              />
            )}
            {/* Hide store name/address when transparent & not scrolled — the hero already shows them */}
            {(!isTransparent || scrolled) && (
              <div className="min-w-0">
                <h1
                  className="text-lg font-bold leading-tight tracking-tight truncate"
                  style={{ color: headerText, fontFamily: "var(--font-display)" }}
                >
                  {storeName}
                </h1>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1.5 truncate" style={{ color: headerText, opacity: 0.8 }}>
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">
                      {location.address_line1}, {location.city}
                    </span>
                  </span>
                  {todayHours && (
                    <span className="inline-flex items-center gap-1.5" style={{ color: headerText, opacity: 0.8 }}>
                      <Clock className="h-3 w-3" />
                      <span>{todayHours}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Mobile-only: dark toggle + cart */}
            <div className="flex lg:hidden items-center gap-0.5">
              <Button
                onClick={toggleDark}
                variant="ghost"
                size="icon"
                className="rounded-full transition-colors"
                style={{ color: headerText }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hoverBg)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <Button
                onClick={toggleCart}
                variant="ghost"
                size="icon"
                className="relative rounded-full transition-colors"
                style={{ color: headerText }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hoverBg)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <ShoppingBag className="h-5 w-5" />
                {displayCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 text-[10px] font-bold h-5 w-5 flex items-center justify-center rounded-full border-2 animate-in zoom-in duration-200"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--primary-text)",
                      borderColor: headerBg === "transparent" ? "transparent" : headerBg,
                    }}
                  >
                    {displayCount}
                  </span>
                )}
              </Button>
            </div>

            <TooltipProvider delayDuration={100}>
            <nav className="hidden lg:flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onInfoClick}
                    variant="ghost"
                    size="icon"
                    className="rounded-full transition-colors"
                    style={
                      {
                        color: headerText,
                        "--hover-bg": hoverBg,
                      } as React.CSSProperties
                    }
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = hoverBg)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                  >
                    <Info className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)", border: "none" }}>
                  <p>Store Info</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onOrdersClick}
                    variant="ghost"
                    size="icon"
                    className="rounded-full transition-colors"
                    style={{ color: headerText }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = hoverBg)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                  >
                    <ClipboardList className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)", border: "none" }}>
                  <p>Order History</p>
                </TooltipContent>
              </Tooltip>

              <div
                className="w-px h-5 mx-2"
                style={{ backgroundColor: dividerColor }}
              />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleAccountClick}
                    variant="ghost"
                    size="icon"
                    className="rounded-full transition-colors relative"
                    style={{ color: headerText }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = hoverBg)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                  >
                    {isAuthenticated && initials ? (
                      <span className="text-xs font-bold">{initials}</span>
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)", border: "none" }}>
                  <p>{isAuthenticated ? "Account" : "Sign In"}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={toggleDark}
                    variant="ghost"
                    size="icon"
                    className="rounded-full transition-colors"
                    style={{ color: headerText }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = hoverBg)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                  >
                    {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)", border: "none" }}>
                  <p>{isDark ? "Light Mode" : "Dark Mode"}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={toggleCart}
                    variant="ghost"
                    size="icon"
                    className="relative rounded-full transition-colors"
                    style={{ color: headerText }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = hoverBg)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                  >
                    <ShoppingBag className="h-5 w-5" />
                    {displayCount > 0 && (
                      <span
                        className="absolute -top-1 -right-1 text-[10px] font-bold h-5 w-5 flex items-center justify-center rounded-full border-2 animate-in zoom-in duration-200"
                        style={{
                          backgroundColor: "var(--accent)",
                          color: "var(--primary-text)",
                          borderColor: headerBg === "transparent"
                            ? "transparent"
                            : headerBg,
                        }}
                      >
                        {displayCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)", border: "none" }}>
                  <p>Your Cart {displayCount > 0 ? `(${displayCount})` : ""}</p>
                </TooltipContent>
              </Tooltip>
            </nav>
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
