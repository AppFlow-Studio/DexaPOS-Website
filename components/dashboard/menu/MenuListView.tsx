"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { MenuActionsDropdown } from "./MenuActionsDropdown";
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
  // Location relation from join
  locations?: {
    id: string;
    name: string;
  } | null;
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
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  hasOrderChanges?: boolean;
  onReorder?: (newMenus: MenuWithLocation[]) => void;
  isFiltered?: boolean;
}

// Internal Helper Interface for Actions
interface MenuActions {
  onToggleActive: (menuId: string) => void;
  onDelete: (menuId: string) => void;
  onDuplicate?: (menuId: string, targetLocationId: string | null) => void;
  onSettings?: (menuId: string) => void;
}

function SortableGridCard({
  menu,
  handleRowClick,
  actions,
  isFiltered,
}: {
  menu: MenuWithLocation;
  handleRowClick: (id: string) => void;
  actions: MenuActions;
  isFiltered?: boolean;
}) {
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
    <div ref={setNodeRef} style={style} className="relative group h-full">
      {/* Drag Handle for Grid - Hidden if filtered */}
      {!isFiltered && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-3 left-3 z-20 p-1.5 bg-background/80 hover:bg-background/100 backdrop-blur-sm rounded-md shadow-sm opacity-50 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      <Card
        className={`transition-all hover:shadow-lg hover:scale-[1.02] cursor-pointer h-full ${
          isDragging ? "shadow-xl ring-2 ring-primary/20" : ""
        }`}
        onClick={() => handleRowClick(menu.id)}
      >
        <CardHeader className={!isFiltered ? "pl-12" : ""}>
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="group-hover:text-primary transition-colors">
                  {menu.name}
                </CardTitle>
                {menu.display_order !== null && (
                  <Badge variant="outline" className="text-xs">
                    #{menu.display_order}
                  </Badge>
                )}
              </div>
              {menu.description && (
                <CardDescription className="line-clamp-2">
                  {menu.description}
                </CardDescription>
              )}
            </div>
            <MenuActionsDropdown
              menuId={menu.id}
              menuName={menu.name}
              isActive={menu.is_active}
              menuLocationId={menu.location_id}
              {...actions}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Badge variant={menu.is_active ? "default" : "secondary"}>
                {menu.is_active ? "Active" : "Inactive"}
              </Badge>
              <LocationBadge menu={menu} />
            </div>
            <span className="text-sm text-muted-foreground">
              {new Date(menu.created_at).toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SortableTableRow({
  menu,
  index,
  onMoveUp,
  onMoveDown,
  handleRowClick,
  actions,
  isLast,
  isFiltered,
}: {
  menu: MenuWithLocation;
  index: number;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  handleRowClick: (id: string) => void;
  actions: MenuActions;
  isLast: boolean;
  isFiltered?: boolean;
}) {
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
      className={`group transition-colors hover:bg-muted/50 ${
        isDragging ? "bg-muted/80" : ""
      }`}
      onClick={() => handleRowClick(menu.id)}
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
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

          {!isFiltered && (
            <div className="flex flex-col gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUp?.(index);
                }}
                disabled={index === 0 || !onMoveUp}
                title="Move up"
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDown?.(index);
                }}
                disabled={isLast || !onMoveDown}
                title="Move down"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
          )}
          <span className="text-xs text-muted-foreground ml-1">
            {menu.display_order ?? "—"}
          </span>
        </div>
      </TableCell>
      <TableCell className="font-medium cursor-pointer">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shrink-0">
            <Utensils className="h-5 w-5 text-primary" />
          </div>
          <span className="group-hover:text-primary transition-colors">
            {menu.name}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground line-clamp-1 max-w-[300px]">
          {menu.description || "—"}
        </span>
      </TableCell>
      <TableCell>
        <LocationBadge menu={menu} />
      </TableCell>
      <TableCell>
        <Badge variant={menu.is_active ? "default" : "secondary"}>
          {menu.is_active ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(menu.created_at).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <MenuActionsDropdown
          menuId={menu.id}
          menuName={menu.name}
          isActive={menu.is_active}
          menuLocationId={menu.location_id}
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
  onMoveUp,
  onMoveDown,
  hasOrderChanges = false,
  onReorder,
  isFiltered = false,
}: MenuListViewProps) {
  const router = useRouter();
  const actions = { onToggleActive, onDelete, onDuplicate, onSettings };

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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-48" />
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {menus.map((menu, index) => (
              <SortableGridCard
                key={menu.id}
                menu={menu}
                handleRowClick={handleRowClick}
                actions={actions}
                isFiltered={isFiltered}
              />
            ))}
          </div>
        </SortableContext>
      ) : (
        <div className="rounded-md border animate-in fade-in duration-300">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[80px]">Order</TableHead>
                <TableHead className="w-[300px]">Menu Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[150px]">Location</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[120px]">Created</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext
                items={menus.map((m) => m.id)}
                strategy={verticalListSortingStrategy}
              >
                {menus.map((menu, index) => (
                  <SortableTableRow
                    key={menu.id}
                    menu={menu}
                    index={index}
                    onMoveUp={onMoveUp}
                    onMoveDown={onMoveDown}
                    handleRowClick={handleRowClick}
                    actions={actions}
                    isLast={index === menus.length - 1}
                    isFiltered={isFiltered}
                  />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
        </div>
      )}
    </DndContext>
  );
}

// Location Badge Component
function LocationBadge({ menu }: { menu: MenuWithLocation }) {
  if (menu.location_id && menu.locations) {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-blue-50 text-blue-700 border-blue-200 shrink-0"
      >
        <MapPin className="h-3 w-3" />
        {menu.locations.name}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0"
    >
      <Globe className="h-3 w-3" />
      Global
    </Badge>
  );
}

export { LocationBadge };
