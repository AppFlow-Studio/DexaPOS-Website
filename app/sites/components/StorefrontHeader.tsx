"use client";

import { Site } from "@/types/site";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "../hooks/useCart";
import { cn } from "@/lib/utils";

interface StorefrontHeaderProps {
  site: Site | null;
  location: {
    name: string;
    address_line1: string;
    city: string;
  };
}

export function StorefrontHeader({ site, location }: StorefrontHeaderProps) {
  const { toggleCart, getTotalItems } = useCart();
  const itemCount = getTotalItems();
  const storeName = site?.title || location.name;

  return (
    <header className="bg-[var(--primary)] text-white p-4 shadow-md sticky top-0 z-50">
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

        <Button
          onClick={toggleCart}
          variant="ghost"
          size="icon"
          className="relative text-white hover:bg-white/20"
        >
          <ShoppingBag className="h-6 w-6" />
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-[var(--secondary)] text-white text-[10px] font-bold h-5 w-5 flex items-center justify-center rounded-full border-2 border-[var(--primary)]">
              {itemCount}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
}
