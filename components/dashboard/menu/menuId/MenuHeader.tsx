"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/shell";
import { Globe, MapPin } from "lucide-react";
import { MenuWithCategories } from "@/types/menu";

interface MenuHeaderProps {
  menu: MenuWithCategories;
  locationName?: string | null;
  onBack: () => void;
  onNavigateToMenus: () => void;
  onPreview?: () => void;
}

export function MenuHeader({
  menu,
  locationName,
  onNavigateToMenus,
  onPreview,
}: MenuHeaderProps) {
  return (
    <PageHeader
      title={menu.name}
      subtitle={menu.description || undefined}
      backHref="/dashboard/menu"
      backLabel="Menus"
      indicator={
        <Badge variant={menu.is_location_owned ? "secondary" : "default"}>
          {menu.is_location_owned ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {locationName || "Location Menu"}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Global Menu
            </span>
          )}
        </Badge>
      }
      actions={
        <>
          {onPreview && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPreview}
              className="h-8 cursor-pointer rounded-full font-medium shadow-sm"
            >
              POS Preview
            </Button>
          )}
          <Badge variant={menu.is_active ? "default" : "secondary"}>
            {menu.is_active ? "Active" : "Inactive"}
          </Badge>
        </>
      }
    />
  );
}
