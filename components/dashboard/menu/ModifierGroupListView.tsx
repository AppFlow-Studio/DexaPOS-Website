"use client";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Layers,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  ModifierGroupsModel,
  ModifierGroupItemsModel,
} from "@/types/db-modles";

interface ModifierGroupWithItems extends ModifierGroupsModel {
  modifier_group_items?: ModifierGroupItemsModel[];
}

interface ModifierGroupListViewProps {
  groups: ModifierGroupWithItems[];
  isLoading?: boolean;
  onEdit: (group: ModifierGroupWithItems) => void;
  onDelete: (group: ModifierGroupWithItems) => void;
  onCreateNew?: () => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
}

export function ModifierGroupListView({
  groups,
  isLoading = false,
  onEdit,
  onDelete,
  onCreateNew,
  emptyStateTitle = "No modifier groups",
  emptyStateDescription = "Create modifier groups to add options to your menu items",
}: ModifierGroupListViewProps) {
  // Loading State
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  // Empty State
  if (groups.length === 0) {
    return (
      <Empty
        icon={Layers}
        title={emptyStateTitle}
        description={emptyStateDescription}
        action={
          onCreateNew ? (
            <Button onClick={onCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          ) : null
        }
      />
    );
  }

  // Table/List View
  return (
    <div className="rounded-md border animate-in fade-in duration-300">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[300px]">Group Name</TableHead>
            <TableHead>Rules</TableHead>
            <TableHead>Options</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            <TableHead className="w-[80px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group, index) => (
            <TableRow
              key={group.id}
              className="group transition-colors hover:bg-muted/50 animate-in fade-in slide-in-from-left-2"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <TableCell
                className="font-medium cursor-pointer"
                onClick={() => onEdit(group)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors shrink-0">
                    <Layers className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="group-hover:text-primary transition-colors font-semibold">
                      {group.name}
                    </div>
                    {group.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {group.description}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell
                onClick={() => onEdit(group)}
                className="cursor-pointer"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {group.is_required ? (
                      <Badge
                        variant="destructive"
                        className="h-5 px-1.5 text-[10px]"
                      >
                        Required
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-[10px]"
                      >
                        Optional
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Min: {group.min_selections} • Max:{" "}
                      {group.max_selections || "∞"}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell
                onClick={() => onEdit(group)}
                className="cursor-pointer"
              >
                <Badge variant="outline" className="text-xs">
                  {group.modifier_group_items?.length || 0} items
                </Badge>
              </TableCell>
              <TableCell
                onClick={() => onEdit(group)}
                className="cursor-pointer"
              >
                {group.location_id ? (
                  <Badge
                    variant="outline"
                    className="text-xs border-blue-200 text-blue-700 bg-blue-50"
                  >
                    Location
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-xs border-emerald-200 text-emerald-700 bg-emerald-50"
                  >
                    Global
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => onEdit(group)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(group)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
