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
import { toast } from "sonner";
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore";
import { TemplateVisualPreview } from "@/components/scheduling/templates/TemplateVisualPreview";

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
    toast("Template Duplicated", {
      description: "A copy of the template has been created.",
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this template?")) {
      actions.deleteTemplate(id);
      toast("Template Deleted", {
        description: "The template has been removed.",
      });
    }
  };

  // Active Template Selection Logic
  const handleToggleSelection = (id: string) => {
    if (selectedActiveIds.includes(id)) {
      setSelectedActiveIds((prev) => prev.filter((pid) => pid !== id));
    } else {
      if (selectedActiveIds.length >= 3) {
        toast("Limit Reached", {
          description: "You can only select up to 3 active templates.",
        });
        return;
      }
      setSelectedActiveIds((prev) => [...prev, id]);
    }
  };

  const handleSaveSelection = () => {
    actions.setActiveTemplateIds(selectedActiveIds);
    setSelectionMode(false);
    toast("Active Templates Updated", {
      description:
        "Your active templates list for quick access has been saved.",
    });
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredTemplates.map((template) => {
            const isActive = activeTemplateIds.includes(template.id);
            const isSelected = selectedActiveIds.includes(template.id);

            return (
              <Card
                key={template.id}
                className={`transition-all ${
                  isSelectionMode ? "cursor-pointer hover:border-primary" : ""
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
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-semibold text-foreground">
                        {template.name}
                      </CardTitle>
                      <div className="flex flex-wrap gap-1">
                        {isActive && !isSelectionMode && (
                          <Badge variant="secondary" className="text-xs">
                            Active
                          </Badge>
                        )}
                        {template.tags?.slice(0, 2).map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {!isSelectionMode && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
                              handleDelete(template.id);
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
                        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
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
                <CardContent>
                  <CardDescription className="line-clamp-2 min-h-[40px] mb-4">
                    {template.description || "No description provided."}
                  </CardDescription>

                  <TemplateVisualPreview shifts={template.shifts} />

                  <div className="mt-4 pt-4 border-t flex justify-between text-xs text-muted-foreground">
                    <span>{template.shifts.length} shifts</span>
                    <span>
                      Created{" "}
                      {format(new Date(template.created_at), "MMM d, yyyy")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
