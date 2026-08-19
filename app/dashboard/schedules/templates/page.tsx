"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Calendar,
  MoreVertical,
  Copy,
  Trash2,
  Edit,
  CheckCircle2,
  ChevronLeft,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore";
import { TemplateVisualPreview } from "@/components/scheduling/templates/TemplateVisualPreview";
import { DeleteConfirmDialog } from "@/app/dashboard/inventory/components/DeleteConfirmDialog";

export default function TemplateLibraryPage() {
  const router = useRouter();
  const { templates, activeTemplateIds, actions } = useScheduleTemplateStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSelectionMode, setSelectionMode] = useState(false);
  const [selectedActiveIds, setSelectedActiveIds] = useState<string[]>([]);

  // Initialize selected IDs when entering selection mode or mounting
  React.useEffect(() => {
    setSelectedActiveIds(activeTemplateIds);
  }, [activeTemplateIds]);

  const filteredTemplates = useMemo(() => {
    if (!searchQuery) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tags?.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        )
    );
  }, [templates, searchQuery]);

  const handleEdit = (id: string) => {
    router.push(`/dashboard/schedules/templates/${id}`);
  };

  const handleDuplicate = (id: string) => {
    actions.duplicateTemplate(id);
  };

  // Holds the template queued for deletion; the native confirm() it replaces
  // was an unstyled browser dialog that also blocked the main thread.
  const [templateToDelete, setTemplateToDelete] = useState<
    (typeof templates)[number] | null
  >(null);

  const handleConfirmDelete = () => {
    if (!templateToDelete) return;
    actions.deleteTemplate(templateToDelete.id);
    setTemplateToDelete(null);
  };

  // Active Template Selection Logic
  const handleToggleSelection = (id: string) => {
    if (selectedActiveIds.includes(id)) {
      setSelectedActiveIds((prev) => prev.filter((pid) => pid !== id));
    } else {
      if (selectedActiveIds.length >= 3) {
        return;
      }
      setSelectedActiveIds((prev) => [...prev, id]);
    }
  };

  const handleSaveSelection = () => {
    actions.setActiveTemplateIds(selectedActiveIds);
    setSelectionMode(false);
  };

  const handleCancelSelection = () => {
    setSelectedActiveIds(activeTemplateIds);
    setSelectionMode(false);
  };

  return (
    <div className="flex min-h-[calc(100vh-6rem)] w-full flex-col space-y-6 bg-white p-4 sm:space-y-8 sm:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Schedule Templates
            </h1>
            <p className="text-muted-foreground">
              {isSelectionMode
                ? `Select up to 3 templates (${selectedActiveIds.length}/3 selected)`
                : "Manage and organize your weekly schedule templates."}
            </p>
          </div>
        </div>

        {!isSelectionMode && (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => setSelectionMode(true)}
              className="gap-2 flex-1 sm:flex-none"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="truncate">Set Active Templates</span>
            </Button>
            <Button
              onClick={() =>
                router.push("/dashboard/schedules/templates/create")
              }
              className="gap-2 flex-1 sm:flex-none"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate">Create Template</span>
            </Button>
          </div>
        )}
      </div>

      {/* Selection Mode Banner */}
      {isSelectionMode && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
            <div>
              <h3 className="font-semibold text-foreground">
                Select Templates for Quick Access
              </h3>
              <p className="text-sm text-muted-foreground">
                These templates will be available in the sidebar when editing
                schedules.
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="ghost"
              onClick={handleCancelSelection}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSelection}
              className="flex-1 sm:flex-none"
            >
              Save Selection ({selectedActiveIds.length})
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-white pl-9"
        />
      </div>

      {/* Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Calendar className="w-16 h-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">
            No templates found
          </h3>
          <p className="text-muted-foreground max-w-sm">
            {searchQuery
              ? "Try adjusting your search terms."
              : "Create your first template to get started with faster scheduling."}
          </p>
          {!searchQuery && (
            <Button
              onClick={() =>
                router.push("/dashboard/schedules/templates/create")
              }
              className="mt-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredTemplates.map((template) => {
            const isActive = activeTemplateIds.includes(template.id);
            const isSelected = selectedActiveIds.includes(template.id);

            return (
              <Card
                key={template.id}
                className={`flex h-full flex-col gap-4 py-4 transition-all sm:gap-6 sm:py-6 ${
                  isSelectionMode
                    ? "cursor-pointer hover:border-primary"
                    : "cursor-pointer hover:border-primary/40 hover:shadow-md"
                } ${
                  isSelectionMode && isSelected
                    ? "ring-2 ring-primary border-primary bg-primary/5"
                    : ""
                }`}
                onClick={() => {
                  if (isSelectionMode) {
                    handleToggleSelection(template.id);
                  } else {
                    handleEdit(template.id);
                  }
                }}
              >
                {/* The menu button is absolute at top-3/right-4, so it only
                    ever overlaps the title line. pr-12 keeps the title clear
                    of it; the badge row sits below the button and needs the
                    full width, otherwise its trailing "+N" ends up under the
                    button's hover background and looks like it vanishes. */}
                <CardHeader className="relative gap-1 px-4 sm:px-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <CardTitle
                        title={template.name}
                        className="truncate pr-8 text-lg font-semibold text-foreground"
                      >
                        {template.name}
                      </CardTitle>
                      {/* At most two badges on one non-wrapping row. "Active"
                          counts as one of the two, so the row can never grow
                          past the card: a third badge plus a "+N" was what
                          overflowed under the menu button. Everything not
                          shown is folded into the single "+N" count. */}
                      {(() => {
                        const tags = template.tags ?? [];
                        const showActive = isActive && !isSelectionMode;
                        const tagSlots = showActive ? 1 : 2;
                        const shownTags = tags.slice(0, tagSlots);
                        const overflow = tags.length - shownTags.length;

                        if (!showActive && tags.length === 0) return null;

                        return (
                          <div className="flex min-w-0 items-center gap-1">
                            {/* "Active" is status rather than decoration, so
                                it survives on mobile; the tags and their
                                overflow count are sm:-only to keep the mobile
                                card compact. */}
                            {showActive && (
                              <Badge
                                variant="secondary"
                                className="shrink-0 text-xs"
                              >
                                Active
                              </Badge>
                            )}
                            {shownTags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="hidden min-w-0 truncate text-xs sm:inline-flex"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {overflow > 0 && (
                              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                                +{overflow}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {!isSelectionMode && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          {/* Absolute, not a flex sibling: as a sibling it sat
                              at the top of its own content box, so its
                              position drifted between cards that have badges
                              and cards that don't. Anchored to the header it
                              lands identically on every card. */}
                          <Button
                            variant="ghost"
                            size="icon"
                            // The title is text-lg (1.75rem line box) and the
                            // button is 2rem, so -top-0.5 against the header's
                            // content box centres the button on the title's
                            // first line. right-6 matches the header's px-6.
                            className="absolute -top-0.5 right-6 h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(template.id);
                            }}
                            className="cursor-pointer"
                          >
                            <Edit className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicate(template.id);
                            }}
                            className="cursor-pointer"
                          >
                            <Copy className="w-4 h-4 mr-2" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setTemplateToDelete(template);
                            }}
                            className="cursor-pointer text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}

                    {isSelectionMode && (
                      <div
                        className={`absolute right-6 top-1 flex h-5 w-5 items-center justify-center rounded-full border ${
                          isSelected
                            ? "bg-primary border-primary"
                            : "border-muted-foreground"
                        }`}
                      >
                        {isSelected && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                {/* flex-1 + mt-auto on the footer pins the meta row to the
                    bottom of every card, so the coverage charts and footers
                    line up across a row even though descriptions and tags are
                    optional and cards therefore differ in natural height. */}
                <CardContent className="flex flex-1 flex-col px-4 sm:px-6">
                  {/* `line-clamp-2` sets display:-webkit-box, which beat the
                      `hidden` utility and kept this visible on mobile. Both the
                      clamp and the display are sm:-only so nothing competes
                      with `hidden` below the breakpoint. */}
                  {template.description && (
                    <CardDescription className="mb-4 hidden sm:line-clamp-2">
                      {template.description}
                    </CardDescription>
                  )}

                  <div className="mt-auto space-y-1.5 pt-2">
                    <span className="hidden text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground sm:block">
                      Weekly coverage
                    </span>
                    <TemplateVisualPreview shifts={template.shifts} />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {template.shifts.length}{" "}
                      {template.shifts.length === 1 ? "shift" : "shifts"}
                    </span>
                    <span className="truncate">
                      {format(new Date(template.created_at), "MMM d, yyyy")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DeleteConfirmDialog
        open={!!templateToDelete}
        onOpenChange={(open) => !open && setTemplateToDelete(null)}
        title="Delete template?"
        description={
          <>
            <span className="font-medium text-foreground">
              {templateToDelete?.name}
            </span>{" "}
            and its {templateToDelete?.shifts.length ?? 0}{" "}
            {templateToDelete?.shifts.length === 1 ? "shift" : "shifts"} will be
            permanently deleted. This cannot be undone.
          </>
        }
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
