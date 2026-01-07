"use client";

import { Site } from "@/types/site";
import { ShoppingBag, Info, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "../hooks/useCart";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StorefrontHeaderProps {
  site: Site | null;
  location: {
    name: string;
    address_line1: string;
    city: string;
  };
  onInfoClick?: () => void;
  onOrdersClick?: () => void;
}

export function StorefrontHeader({
  site,
  location,
  onInfoClick,
  onOrdersClick,
}: StorefrontHeaderProps) {
  const { toggleCart, getTotalItems } = useCart();
  const itemCount = getTotalItems();
  const storeName = site?.title || location.name;
  const headerStyle = site?.theme_config?.headerStyle || "primary";

  const headerClasses = cn(
    "p-4 shadow-md sticky top-0 z-50 transition-colors duration-300",
    {
      "bg-[var(--primary)] text-white": headerStyle === "primary",
      "bg-zinc-900 text-white": headerStyle === "dark",
      "bg-white text-gray-900 border-b border-gray-100":
        headerStyle === "light",
    }
  );

  const iconClasses = cn("relative transition-all hover:scale-105", {
    "text-white hover:bg-white/20":
      headerStyle === "primary" || headerStyle === "dark",
    "text-gray-700 hover:bg-gray-100": headerStyle === "light",
  });

  return (
    <header className={headerClasses}>
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          {site?.logo_url && (
            <img
              src={site.logo_url}
              alt={`${storeName} Logo`}
              className="h-10 w-10 rounded-full object-cover bg-white"
            />
          )}
          <div>
            <h1 className="text-xl font-bold leading-tight">{storeName}</h1>
            <p className="text-sm opacity-90">
              {location.address_line1}, {location.city}
            </p>
          </div>
        </div>

        {/* Desktop Navigation - Hidden on mobile since we have bottom tabs */}
        <TooltipProvider delayDuration={100}>
          <nav className="hidden lg:flex items-center gap-1">
            {/* Info Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onInfoClick}
                  variant="ghost"
                  size="icon"
                  className={iconClasses}
                >
                  <Info className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="bg-gray-900 text-white border-gray-700"
              >
                <p>Store Info</p>
              </TooltipContent>
            </Tooltip>

            {/* Orders Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onOrdersClick}
                  variant="ghost"
                  size="icon"
                  className={iconClasses}
                >
                  <ClipboardList className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="bg-gray-900 text-white border-gray-700"
              >
                <p>Your Orders</p>
              </TooltipContent>
            </Tooltip>

            {/* Divider */}
            <div
              className={cn(
                "w-px h-6 mx-2",
                headerStyle === "light" ? "bg-gray-200" : "bg-white/30"
              )}
            />

            {/* Cart Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={toggleCart}
                  variant="ghost"
                  size="icon"
                  className={iconClasses}
                >
                  <ShoppingBag className="h-5 w-5" />
                  {itemCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[var(--secondary)] text-white text-[10px] font-bold h-5 w-5 flex items-center justify-center rounded-full border-2 border-[var(--primary)] animate-in zoom-in duration-200">
                      {itemCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="bg-gray-900 text-white border-gray-700"
              >
                <p>Your Cart {itemCount > 0 && `(${itemCount})`}</p>
              </TooltipContent>
            </Tooltip>
          </nav>
        </TooltipProvider>

        {/* Mobile - No navigation icons, all in bottom tabs */}
      </div>
    </header>
  );
}
