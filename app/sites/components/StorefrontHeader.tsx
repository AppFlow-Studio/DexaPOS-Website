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
  location: {
    name: string;
    address_line1: string;
    city: string;
  };
  storeConfigId?: string;
  onInfoClick?: () => void;
  onOrdersClick?: () => void;
  onAccountClick?: () => void;
}

export function StorefrontHeader({
  site,
  location,
  storeConfigId,
  onInfoClick,
  onOrdersClick,
  onAccountClick,
}: StorefrontHeaderProps) {
  const { toggleCart, getTotalItems } = useCart();
  const { isAuthenticated, customer } = useSession();
  const [showAuth, setShowAuth] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const itemCount = getTotalItems();
  const storeName = site?.title || location.name;
  const headerStyle = site?.theme_config?.headerStyle || "filled";
  const isTransparent = headerStyle === "transparent";

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

  const positionClass = isTransparent ? "absolute" : "sticky";

  const headerBg =
    isTransparent && scrolled
      ? "var(--primary)"
      : "var(--header-bg)";

  const headerText =
    isTransparent && scrolled
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
        className={`${positionClass} top-0 z-50 w-full transition-all duration-300`}
        style={{
          backgroundColor: headerBg,
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
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
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
            <div>
              <h1
                className="text-lg font-bold leading-tight tracking-tight"
                style={{ color: headerText }}
              >
                {storeName}
              </h1>
              <p
                className="text-xs leading-tight"
                style={{
                  color: headerText,
                  opacity: 0.7,
                }}
              >
                {location.address_line1}, {location.city}
              </p>
            </div>
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
                <TooltipContent side="bottom">
                  <p>Your Orders</p>
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
                    {itemCount > 0 && (
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
                        {itemCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Your Cart {itemCount > 0 && `(${itemCount})`}</p>
                </TooltipContent>
              </Tooltip>
            </nav>
          </TooltipProvider>
        </div>
      </header>

      <AuthDialog
        isOpen={showAuth}
        onOpenChange={setShowAuth}
        storeConfigId={storeConfigId ?? ""}
      />
    </>
  );
}
