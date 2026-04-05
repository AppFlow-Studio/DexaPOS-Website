"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScopeContextStrip } from "@/components/dashboard/menu/ScopeContextStrip";
import { ItemQuickActions } from "@/components/dashboard/menu/item-edit/ItemQuickActions";
import { ItemSummaryCard } from "@/components/dashboard/menu/item-edit/ItemSummaryCard";
import { OverviewSection } from "@/components/dashboard/menu/item-edit/sections/OverviewSection";
import { PricingSection } from "@/components/dashboard/menu/item-edit/sections/PricingSection";
import { CategoriesSection } from "@/components/dashboard/menu/item-edit/sections/CategoriesSection";
import { ModifiersSection } from "@/components/dashboard/menu/item-edit/sections/ModifiersSection";
import { AvailabilitySection } from "@/components/dashboard/menu/item-edit/sections/AvailabilitySection";
import { AllergensSection } from "@/components/dashboard/menu/item-edit/sections/AllergensSection";
import { AdvancedSection } from "@/components/dashboard/menu/item-edit/sections/AdvancedSection";
import { useMenuItemWithLocationContext } from "@/app/dashboard/hooks/useLocationScoped";
import {
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import { deriveScopeFromContext } from "@/lib/menu/cascade-labels";

interface ItemEditLayoutProps {
  itemId: string;
}

interface SectionDef {
  id: string;
  label: string;
  /** True when this section can save at a non-L1 scope */
  locationAware: boolean;
  render: (ctx: SectionRenderCtx) => React.ReactNode;
}

export interface SectionRenderCtx {
  itemId: string;
  item: any;
  scope: ReturnType<typeof deriveScopeFromContext>;
  globalScope: ReturnType<typeof deriveScopeFromContext>;
}

const SECTIONS: SectionDef[] = [
  {
    id: "overview",
    label: "Overview",
    locationAware: false,
    render: (c) => <OverviewSection {...c} />,
  },
  {
    id: "pricing",
    label: "Pricing",
    locationAware: true,
    render: (c) => <PricingSection {...c} />,
  },
  {
    id: "categories",
    label: "Categories",
    locationAware: false,
    render: (c) => <CategoriesSection {...c} />,
  },
  {
    id: "modifiers",
    label: "Modifiers",
    locationAware: false,
    render: (c) => <ModifiersSection {...c} />,
  },
  {
    id: "availability",
    label: "Availability",
    locationAware: true,
    render: (c) => <AvailabilitySection {...c} />,
  },
  {
    id: "allergens",
    label: "Allergens",
    locationAware: false,
    render: (c) => <AllergensSection {...c} />,
  },
  {
    id: "advanced",
    label: "Advanced",
    locationAware: false,
    render: (c) => <AdvancedSection {...c} />,
  },
];

export function ItemEditLayout({ itemId }: ItemEditLayoutProps) {
  const { data: item, isLoading } = useMenuItemWithLocationContext(itemId);
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();
  const [activeSection, setActiveSection] = React.useState("overview");
  const sectionRefs = React.useRef<Record<string, HTMLElement | null>>({});

  // Intersection observer for active-section highlighting
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const id = visible[0].target.getAttribute("data-section-id");
          if (id) setActiveSection(id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [item]);

  const handleNavClick = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  // scope contexts
  const locationAwareScope = deriveScopeFromContext({
    isAllLocations,
    locationName: selectedLocation?.name ?? null,
  });
  const globalScope = deriveScopeFromContext({ isAllLocations: true });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Item not found.
      </div>
    );
  }

  const sectionCtxFor = (locationAware: boolean): SectionRenderCtx => ({
    itemId,
    item,
    scope: locationAware ? locationAwareScope : globalScope,
    globalScope,
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b bg-background px-4 py-3 sm:px-6">
        <ScopeContextStrip />
        <div className="mt-3">
          <ItemQuickActions item={item} itemId={itemId} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sticky section nav */}
        <aside className="hidden w-[180px] shrink-0 border-r bg-muted/20 px-3 py-4 md:block">
          <nav className="flex flex-col gap-1">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => handleNavClick(section.id)}
                className={cn(
                  "rounded px-2 py-1.5 text-left text-xs font-medium transition-colors",
                  activeSection === section.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Scrolling content */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-2xl space-y-10">
            {SECTIONS.map((section) => (
              <section
                key={section.id}
                id={section.id}
                data-section-id={section.id}
                ref={(el) => {
                  sectionRefs.current[section.id] = el;
                }}
                className="scroll-mt-6"
              >
                {section.render(sectionCtxFor(section.locationAware))}
              </section>
            ))}
          </div>
        </main>

        {/* Live summary card */}
        <aside className="hidden w-[300px] shrink-0 border-l bg-muted/10 px-4 py-6 lg:block">
          <ItemSummaryCard item={item} itemId={itemId} />
        </aside>
      </div>
    </div>
  );
}

export default ItemEditLayout;
