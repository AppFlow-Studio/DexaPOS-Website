import { useQuery } from "@tanstack/react-query";

import { GetMenus, GetMenuWithCategories } from "@/app/dashboard/actions/menus";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import type { MenuCategory } from "@/types/menu";

export interface PreviewSection {
  menuId: string;
  title: string;
  categories: MenuCategory[];
}

/**
 * Real menu data for the kiosk preview, scoped to a specific `locationId` —
 * intentionally not the globally-selected location (the kiosk editor page
 * has its own location in the URL, which can differ from whatever a
 * multi-location merchant currently has picked in the dashboard switcher).
 *
 * Mirrors the POS's `menus -> categories -> items` shape (see
 * useMenuStore in the tablet app), filtered to active menus/categories with
 * at least one item, matching KioskMenuView's `isMenuAvailableNow` /
 * `isCategoryAvailableNow` filtering at a static level — there's no
 * schedule-window evaluation here (that logic lives only in the POS app),
 * so a menu/category that's active but outside its schedule will still show
 * in this preview.
 */
export function usePreviewMenu(locationId: string) {
  const clerkOrgId = useClerkOrgId();

  const menusQuery = useQuery({
    queryKey: ["kiosk-preview-menus", clerkOrgId, locationId],
    queryFn: () => GetMenus(clerkOrgId, locationId),
    enabled: !!clerkOrgId && !!locationId,
  });

  const menus = menusQuery.data ?? [];
  const activeMenuIds = menus.filter((m) => m.is_active).map((m) => m.id);

  const categoriesQuery = useQuery({
    queryKey: ["kiosk-preview-menu-categories", locationId, activeMenuIds],
    queryFn: async () => {
      const results = await Promise.all(
        activeMenuIds.map((menuId) => GetMenuWithCategories(menuId, locationId)),
      );
      return results;
    },
    enabled: !!locationId && activeMenuIds.length > 0,
  });

  const sections: PreviewSection[] = (categoriesQuery.data ?? [])
    .filter((menu): menu is NonNullable<typeof menu> => menu !== null)
    .map((menu) => ({
      menuId: menu.id,
      title: menu.name,
      categories: menu.categories.filter((c) => c.is_active && c.items.length > 0),
    }))
    .filter((section) => section.categories.length > 0);

  return {
    sections,
    isLoading: menusQuery.isLoading || categoriesQuery.isLoading,
  };
}
