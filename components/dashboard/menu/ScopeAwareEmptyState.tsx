"use client";

import * as React from "react";
import { Package, Tag, BookOpen, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import { useRoleAwareScopeCopy } from "@/lib/menu/useRoleAwareScope";

type EntityType = "items" | "categories" | "menus" | "modifiers" | "overrides";

interface ScopeAwareEmptyStateProps {
  entity: EntityType;
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  className?: string;
  /** Override the computed title */
  title?: string;
  /** Override the computed description */
  description?: string;
}

const ENTITY_META: Record<
  EntityType,
  { icon: LucideIcon; plural: string; singular: string }
> = {
  items: { icon: Package, plural: "items", singular: "item" },
  categories: { icon: Tag, plural: "categories", singular: "category" },
  menus: { icon: BookOpen, plural: "menus", singular: "menu" },
  modifiers: {
    icon: Sparkles,
    plural: "modifier groups",
    singular: "modifier group",
  },
  overrides: { icon: Package, plural: "overrides", singular: "override" },
};

function computeCopy(
  entity: EntityType,
  isAllLocations: boolean,
  locationName: string | null,
): { title: string; description: string } {
  const meta = ENTITY_META[entity];

  if (entity === "overrides") {
    if (isAllLocations) {
      return {
        title: "No overrides configured",
        description:
          "Switch to a specific location to create location-specific prices or availability overrides.",
      };
    }
    return {
      title: `No overrides at ${locationName || "this location"}`,
      description: `Every item here inherits the Global price. Create an override to customize pricing for ${locationName || "this location"}.`,
    };
  }

  if (isAllLocations) {
    return {
      title: `No ${meta.plural} yet`,
      description: `Create your first ${meta.singular} to see it at every location.`,
    };
  }

  return {
    title: `No ${meta.plural} at ${locationName || "this location"} yet`,
    description: `Create a location-specific ${meta.singular} or share a Global ${meta.singular} to this location.`,
  };
}

/**
 * Replaces generic "no results" messages with copy that reflects the
 * current location scope. Makes it obvious when the empty state is
 * because of scope (vs. genuinely no data).
 */
export function ScopeAwareEmptyState({
  entity,
  onPrimaryAction,
  primaryActionLabel,
  className,
  title: titleOverride,
  description: descriptionOverride,
}: ScopeAwareEmptyStateProps) {
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();
  const Icon = ENTITY_META[entity].icon;

  const vm = useRoleAwareScopeCopy(
    { level: isAllLocations ? 1 : 2 },
    { entity },
  );

  const computed = computeCopy(
    entity,
    isAllLocations,
    selectedLocation?.name ?? null,
  );
  const title = vm.empty.override ? vm.empty.title : computed.title;
  const description = vm.empty.override
    ? vm.empty.description
    : computed.description;
  const showPrimaryAction = !vm.role.isMember;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mt-3 text-sm font-semibold">
        {titleOverride ?? title}
      </h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        {descriptionOverride ?? description}
      </p>
      {showPrimaryAction && onPrimaryAction && primaryActionLabel && (
        <Button
          onClick={onPrimaryAction}
          size="sm"
          className="mt-4"
          type="button"
        >
          {primaryActionLabel}
        </Button>
      )}
    </div>
  );
}

export default ScopeAwareEmptyState;
