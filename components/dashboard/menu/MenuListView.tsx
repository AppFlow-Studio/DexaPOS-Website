"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Empty } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Utensils,
  Plus,
  MapPin,
  Globe,
  GripVertical,
  Star,
} from "lucide-react";
import { MenuActionsDropdown } from "./MenuActionsDropdown";
import { MenuChannelVisibilityControls } from "./MenuChannelVisibilityControls";
import {
  normalizeMenuChannelVisibility,
  type MenuChannelVisibility,
} from "@/lib/menu/menu-channel-visibility";
import { useIsSingleLocation } from "@/stores/location-store";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Extended Menu type with location info
export interface MenuWithLocation {
  id: string;
  merchant_id: string;
  location_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number | null;
  created_at: string;
  updated_at: string;
  is_visible_on_pos?: boolean;
  is_visible_on_kiosk?: boolean;
  is_visible_online?: boolean;
  // Location relation from join
  locations?: {
    id: string;
    name: string;
  } | null;
  available_locations?: Array<{
    id: string;
    name: string;
  }> | null;
}

interface MenuListViewProps {
  menus: MenuWithLocation[];
  isLoading?: boolean;
  viewMode: "grid" | "list";
  onToggleActive: (menuId: string) => void;
  onDelete: (menuId: string) => void;
  onCreateNew?: () => void;
  /** Duplicate menu handler - receives menuId and target locationId (null = global) */
  onDuplicate?: (menuId: string, targetLocationId: string | null) => void;
  onSettings?: (menuId: string) => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  hasOrderChanges?: boolean;
  onReorder?: (newMenus: MenuWithLocation[]) => void;
  isFiltered?: boolean;
  /** The location's canonical OrderOut online-ordering menu id (null = none/n-a) */
  onlineMenuId?: string | null;
  /** Menu ids linked+active on OrderOut for the location (eligible to become primary) */
  linkedMenuIds?: string[];
  onSetOnlineMenu?: (menuId: string) => void;
  onChannelVisibilityChange?: (
    menuId: string,
    visibility: MenuChannelVisibility,
  ) => void;
  channelVisibilityDisabled?: boolean;
  savingVisibilityMenuId?: string | null;
  /** Show effective menu availability across locations in the table view. */
  showLocations?: boolean;
}

// Internal Helper Interface for Actions
interface MenuActions {
  onToggleActive: (menuId: string) => void;
  onDelete: (menuId: string) => void;
  onDuplicate?: (menuId: string, targetLocationId: string | null) => void;
  onSettings?: (menuId: string) => void;
  onSetOnlineMenu?: (menuId: string) => void;
}

function SortableGridCard({
  menu,
  handleRowClick,
  actions,
  isFiltered,
  onlineMenuId,
  linkedMenuIds,
  onChannelVisibilityChange,
  channelVisibilityDisabled,
  isSavingVisibility,
}: {
  menu: MenuWithLocation;
  handleRowClick: (id: string) => void;
  actions: MenuActions;
  isFiltered?: boolean;
  onlineMenuId?: string | null;
  linkedMenuIds?: string[];
  onChannelVisibilityChange?: MenuListViewProps["onChannelVisibilityChange"];
  channelVisibilityDisabled?: boolean;
  isSavingVisibility?: boolean;
}) {
  const isOnlineMenu = !!onlineMenuId && onlineMenuId === menu.id;
  const visibility = normalizeMenuChannelVisibility(menu);
  const canSetOnlineMenu = visibility.is_visible_online &&
    (linkedMenuIds?.includes(menu.id) ?? false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: menu.id, disabled: isFiltered });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group h-full min-w-0">
      {/* Borderless tinted tile — the grid's own spacing separates the cards,
          so each one does not need to draw its own box (D-02).
          Flex column + `mt-auto` on the footer: every card fills the row height
          so the status row lands on one baseline across the whole row.
          Corners: name + icon top-left, actions top-right, status bottom-left,
          drag handle bottom-right. */}
      <div
        className={cn(
          "flex h-full min-h-[8.5rem] min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border-0 bg-muted/50 p-4 shadow-none transition-colors hover:bg-muted/80",
          isDragging && "ring-2 ring-primary/20"
        )}
        onClick={() => handleRowClick(menu.id)}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold transition-colors group-hover:text-primary">
              {menu.name}
            </h3>
            {/* Single line, ellipsised past the card width. The reserved height
                keeps description-less cards the same height as their row. */}
            <p
              className="mt-1 line-clamp-1 min-h-[1rem] text-xs text-muted-foreground"
              title={menu.description || undefined}
            >
              {menu.description || ""}
            </p>
          </div>

          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <MenuActionsDropdown
              menuId={menu.id}
              menuName={menu.name}
              isActive={menu.is_active}
              menuLocationId={menu.location_id}
              isOnlineMenu={isOnlineMenu}
              canSetOnlineMenu={canSetOnlineMenu}
              {...actions}
            />
          </div>
        </div>

        <div className="pt-3" onClick={(event) => event.stopPropagation()}>
          <MenuChannelVisibilityControls
            compact
            value={visibility}
            disabled={channelVisibilityDisabled || isSavingVisibility}
            onChange={(next) => onChannelVisibilityChange?.(menu.id, next)}
          />
        </div>

        <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
              menu.is_active
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-muted/60 text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                menu.is_active ? "bg-green-500" : "bg-muted-foreground/40"
              )}
            />
            {menu.is_active ? "Active" : "Inactive"}
          </span>
          {isOnlineMenu && <OnlineMenuBadge />}

          {/* Drag handle anchors the bottom-right corner. `ml-auto` keeps it
              pinned right even when the status badges wrap to a second line. */}
          {!isFiltered && (
            <div
              {...attributes}
              {...listeners}
              className="ml-auto shrink-0 cursor-grab touch-none rounded-md p-1 text-muted-foreground/40 opacity-0 transition-colors hover:bg-muted hover:text-foreground focus-visible:opacity-100 active:cursor-grabbing group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-4 w-4" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableTableRow({
  menu,
  handleRowClick,
  actions,
  isFiltered,
  onlineMenuId,
  linkedMenuIds,
  onChannelVisibilityChange,
  channelVisibilityDisabled,
  isSavingVisibility,
  showLocations,
}: {
  menu: MenuWithLocation;
  handleRowClick: (id: string) => void;
  actions: MenuActions;
  isFiltered?: boolean;
  onlineMenuId?: string | null;
  linkedMenuIds?: string[];
  onChannelVisibilityChange?: MenuListViewProps["onChannelVisibilityChange"];
  channelVisibilityDisabled?: boolean;
  isSavingVisibility?: boolean;
  showLocations: boolean;
}) {
  const isOnlineMenu = !!onlineMenuId && onlineMenuId === menu.id;
  const visibility = normalizeMenuChannelVisibility(menu);
  const canSetOnlineMenu = visibility.is_visible_online &&
    (linkedMenuIds?.includes(menu.id) ?? false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: menu.id, disabled: isFiltered });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`group border-0 bg-card/70 transition-colors hover:bg-muted/40 ${
        isDragging ? "bg-muted/80" : ""
      }`}
      onClick={() => handleRowClick(menu.id)}
    >
      <TableCell
        className="hidden sm:table-cell"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1">
          {!isFiltered ? (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing hover:bg-muted rounded p-1 touch-none text-muted-foreground hover:text-foreground transition-colors"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : (
            // Spacer to keep alignment if filtered
            <div className="w-6" />
          )}

          <span className="text-xs text-muted-foreground ml-1">
            {menu.display_order ?? "—"}
          </span>
        </div>
      </TableCell>
      <TableCell className="min-w-0 cursor-pointer">
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground sm:flex">
            <Utensils className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="whitespace-nowrap text-sm font-medium sm:truncate">
              {menu.name}
            </div>
            {menu.description && (
              <div className="hidden max-w-[280px] truncate text-xs text-muted-foreground sm:block">
                {menu.description}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      {showLocations && (
        <TableCell className="hidden sm:table-cell">
          <AvailableLocations menu={menu} />
        </TableCell>
      )}
      <TableCell>
        <div onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Switch
              checked={menu.is_active}
              onCheckedChange={() => actions.onToggleActive(menu.id)}
              aria-label={`${menu.is_active ? "Deactivate" : "Activate"} ${menu.name}`}
            />
            <span
              className={cn(
                "text-[11px] font-medium sm:text-sm",
                menu.is_active
                  ? "text-green-600"
                  : "text-muted-foreground",
              )}
            >
              {menu.is_active ? "Active" : "Inactive"}
            </span>
            {isOnlineMenu && (
              <span className="hidden sm:inline-flex">
                <OnlineMenuBadge />
              </span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell
        className="hidden md:table-cell"
        onClick={(event) => event.stopPropagation()}
      >
        <MenuChannelVisibilityControls
          compact
          value={visibility}
          disabled={channelVisibilityDisabled || isSavingVisibility}
          onChange={(next) => onChannelVisibilityChange?.(menu.id, next)}
        />
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        {new Date(menu.created_at).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <MenuActionsDropdown
          menuId={menu.id}
          menuName={menu.name}
          isActive={menu.is_active}
          menuLocationId={menu.location_id}
          isOnlineMenu={isOnlineMenu}
          canSetOnlineMenu={canSetOnlineMenu}
          {...actions}
        />
      </TableCell>
    </TableRow>
  );
}

export function MenuListView({
  menus,
  isLoading = false,
  viewMode,
  onToggleActive,
  onDelete,
  onCreateNew,
  onDuplicate,
  onSettings,
  emptyStateTitle = "No menus yet",
  emptyStateDescription = "Get started by creating your first menu",
  hasOrderChanges = false,
  onReorder,
  isFiltered = false,
  onlineMenuId,
  linkedMenuIds,
  onSetOnlineMenu,
  onChannelVisibilityChange,
  channelVisibilityDisabled = false,
  savingVisibilityMenuId,
  showLocations = false,
}: MenuListViewProps) {
  const router = useRouter();
  const actions = { onToggleActive, onDelete, onDuplicate, onSettings, onSetOnlineMenu };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = menus.findIndex((m) => m.id === active.id);
      const newIndex = menus.findIndex((m) => m.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newMenus = arrayMove(menus, oldIndex, newIndex);
        if (onReorder) {
          onReorder(newMenus);
        }
      }
    }
  };

  const handleRowClick = (menuId: string) => {
    router.push(`/dashboard/menu/${menuId}`);
  };

  // Loading State
  if (isLoading) {
    return viewMode === "grid" ? (
      <div className="grid min-w-0 gap-4 [&>*]:min-w-0 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-[8.5rem] rounded-2xl" />
        ))}
      </div>
    ) : (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  // Empty State
  if (menus.length === 0) {
    return (
      <Empty
        icon={Utensils}
        title={emptyStateTitle}
        description={emptyStateDescription}
        action={
          onCreateNew ? (
            <Button onClick={onCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create Menu
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {viewMode === "grid" ? (
        <SortableContext
          items={menus.map((m) => m.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid min-w-0 gap-4 [&>*]:min-w-0 md:grid-cols-2 lg:grid-cols-3">
            {menus.map((menu, index) => (
              <SortableGridCard
                key={menu.id}
                menu={menu}
                handleRowClick={handleRowClick}
                actions={actions}
                isFiltered={isFiltered}
                onlineMenuId={onlineMenuId}
                linkedMenuIds={linkedMenuIds}
                onChannelVisibilityChange={onChannelVisibilityChange}
                channelVisibilityDisabled={channelVisibilityDisabled}
                isSavingVisibility={savingVisibilityMenuId === menu.id}
              />
            ))}
          </div>
        </SortableContext>
      ) : (
          <Table
            variant="data"
            containerClassName="thin-scrollbar min-w-0 animate-in fade-in duration-300"
            className={cn(
              "min-w-[400px] table-auto max-sm:[&_td]:px-1.5 max-sm:[&_th]:px-1.5",
              showLocations ? "sm:min-w-[760px] md:min-w-[1080px]" : "sm:min-w-[610px] md:min-w-[910px]",
            )}
          >
            <caption className="sr-only">Menus</caption>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden w-[80px] sm:table-cell">Order</TableHead>
                <TableHead className="min-w-[210px] sm:w-[300px] sm:min-w-0">Menu Name</TableHead>
                {showLocations && (
                  <TableHead
                    scope="col"
                    className="hidden w-[170px] sm:table-cell"
                  >
                    Locations
                  </TableHead>
                )}
                <TableHead className="w-[90px] sm:w-[100px]">Status</TableHead>
                <TableHead className="hidden w-[300px] md:table-cell">Platforms</TableHead>
                <TableHead className="hidden w-[120px] sm:table-cell">Created</TableHead>
                <TableHead className="w-[64px] text-right sm:w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext
                items={menus.map((m) => m.id)}
                strategy={verticalListSortingStrategy}
              >
                {menus.map((menu) => (
                  <SortableTableRow
                    key={menu.id}
                    menu={menu}
                    handleRowClick={handleRowClick}
                    actions={actions}
                    isFiltered={isFiltered}
                    onlineMenuId={onlineMenuId}
                    linkedMenuIds={linkedMenuIds}
                    onChannelVisibilityChange={onChannelVisibilityChange}
                    channelVisibilityDisabled={channelVisibilityDisabled}
                    isSavingVisibility={savingVisibilityMenuId === menu.id}
                    showLocations={showLocations}
                  />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
      )}
    </DndContext>
  );
}

function AvailableLocations({ menu }: { menu: MenuWithLocation }) {
  const locations = menu.available_locations;

  if (locations == null) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (locations.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">Not available</span>
    );
  }

  return (
    <div className="flex max-w-[220px] items-center gap-1">
      <Badge
        variant="secondary"
        className="min-w-0 max-w-[130px] gap-1 rounded-full border-0 bg-muted/60 px-2.5 text-xs text-muted-foreground"
      >
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{locations[0].name}</span>
      </Badge>
      {locations.length > 1 && (
        <Badge
          variant="secondary"
          className="shrink-0 rounded-full border-0 bg-muted/60 px-2.5 text-xs text-muted-foreground tabular-nums"
          title={locations
            .slice(1)
            .map(location => location.name)
            .join(", ")}
        >
          +{locations.length - 1} more
        </Badge>
      )}
    </div>
  );
}

// The location's canonical OrderOut online-ordering menu.
function OnlineMenuBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-amber-200 bg-amber-50 text-amber-700 shrink-0",
        className,
      )}
    >
      <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
      Online menu
    </Badge>
  );
}

// Location Badge Component
function LocationBadge({ menu }: { menu: MenuWithLocation }) {
  const isSingleLocation = useIsSingleLocation();

  // Single-location accounts have one menu plane — a "Global"/location badge on
  // every menu is noise that leaks the multi-location framing. Hide it.
  if (isSingleLocation) {
    return null;
  }

  if (menu.location_id && menu.locations) {
    return (
      <Badge
        variant="secondary"
        className="max-w-full min-w-0 gap-1 rounded-full border-0 bg-[#0C4FD1]/10 px-2.5 text-xs text-[#0C4FD1] dark:text-[#6CA0FF]"
      >
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{menu.locations.name}</span>
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className="shrink-0 gap-1 rounded-full border-0 bg-emerald-50 px-2.5 text-xs text-emerald-700"
    >
      <Globe className="h-3 w-3" />
      Global
    </Badge>
  );
}

export { LocationBadge };
