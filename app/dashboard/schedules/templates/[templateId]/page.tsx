"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore";
import { useUnifiedStaff } from "@/app/dashboard/hooks/useStaff";
import { ScheduleTemplate, TemplateShift } from "@/types/schedule";
import TemplateGrid from "@/components/scheduling/templates/TemplateGrid";
import { ShiftModal } from "@/components/scheduling/ShiftModal";

const TAGS = [
  "Morning",
  "Evening",
  "Weekend",
  "Holiday",
  "Minimal",
  "Full Staff",
];

export default function EditTemplatePage({
  params,
}: {
  params: { templateId: string };
}) {
  const router = useRouter();
  const { templates, actions } = useScheduleTemplateStore();
  const { data: employees } = useUnifiedStaff();

  // Find template by ID
  const existingTemplate = templates.find((t) => t.id === params.templateId);

  const [template, setTemplate] = useState<Omit<
    ScheduleTemplate,
    "created_at"
  > | null>(null);
  const [isShiftEditorOpen, setIsShiftEditorOpen] = useState(false);
  const [selectedShift, setSelectedShift] =
    useState<Partial<TemplateShift> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (existingTemplate) {
      setTemplate({
        id: existingTemplate.id,
        name: existingTemplate.name,
        description: existingTemplate.description,
        tags: existingTemplate.tags || [],
        shifts: existingTemplate.shifts,
      });
    }
  }, [existingTemplate]);

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter((emp) =>
      emp.display_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [employees, searchQuery]);

  if (!template) {
    return (
      <div className="p-8 text-white">Loading or Template Not Found...</div>
    );
  }

  // Form Handlers
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTemplate((prev) => (prev ? { ...prev, name: e.target.value } : null));
  };

  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setTemplate((prev) =>
      prev ? { ...prev, description: e.target.value } : null
    );
  };

  const handleToggleTag = (tag: string) => {
    setTemplate((prev) => {
      if (!prev) return null;
      const currentTags = prev.tags || [];
      const newTags = currentTags.includes(tag)
        ? currentTags.filter((t) => t !== tag)
        : [...currentTags, tag];
      return { ...prev, tags: newTags };
    });
  };

  // Shift Handlers
  const handleAddShift = (employeeId: string, dayOfWeek: number) => {
    const employee = employees?.find((e) => e.member_id === employeeId);
    if (!employee) return;

    const roleName =
      employee.location_assignments.find((a) => a.is_primary)?.role_name ||
      employee.location_assignments[0]?.role_name ||
      "server";

    setSelectedShift({
      tempId: crypto.randomUUID(),
      employeeId,
      dayOfWeek, // 0-6
      role: roleName as any,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    });
    setIsShiftEditorOpen(true);
  };

  const handleShiftPress = (shift: TemplateShift) => {
    setSelectedShift(shift);
    setIsShiftEditorOpen(true);
  };

  const handleSaveShift = (savedShift: Partial<TemplateShift>) => {
    setTemplate((prev) => {
      if (!prev) return null;
      const existingIndex = prev.shifts.findIndex(
        (s) => s.tempId === savedShift.tempId
      );
      let newShifts = [...prev.shifts];
      const fullShift = savedShift as TemplateShift;

      if (existingIndex > -1) {
        newShifts[existingIndex] = fullShift;
      } else {
        newShifts.push(fullShift);
      }
      return { ...prev, shifts: newShifts };
    });
    setIsShiftEditorOpen(false);
    setSelectedShift(null);
  };

  const handleDeleteShift = (tempId: string) => {
    setTemplate((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        shifts: prev.shifts.filter((s) => s.tempId !== tempId),
      };
    });
    setIsShiftEditorOpen(false);
    setSelectedShift(null);
  };

  const handleSave = () => {
    if (!template || !template.name.trim()) {
      toast("Name Required", {
        description: "Please enter a name for the template before saving.",
      });
      return;
    }

    actions.updateTemplate(template.id, {
      name: template.name,
      description: template.description,
      tags: template.tags,
      shifts: template.shifts,
    });

    toast("Template Updated", {
      description: `The template "${template.name}" has been successfully updated.`,
    });
    router.back();
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Edit Template</h1>
            <p className="text-sm text-muted-foreground">
              Modify existing schedule template
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex">
        {/* Sidebar / Form */}
        <div className="w-80 border-r p-6 overflow-y-auto bg-muted/10">
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Template Name</label>
              <Input
                placeholder="e.g. Standard Week"
                value={template.name}
                onChange={handleNameChange}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Describe this schedule..."
                value={template.description}
                onChange={handleDescriptionChange}
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tags</label>
              <div className="flex flex-wrap gap-2">
                {TAGS.map((tag) => {
                  const isSelected = template.tags?.includes(tag);
                  return (
                    <Badge
                      key={tag}
                      variant={isSelected ? "default" : "outline"}
                      className={`cursor-pointer ${
                        isSelected ? "" : "hover:bg-muted"
                      }`}
                      onClick={() => handleToggleTag(tag)}
                    >
                      {tag}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {/* Search Bar */}
          <div className="p-4 border-b flex items-center gap-4 bg-muted/5">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search employees..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex-1 p-6 overflow-hidden">
            <TemplateGrid
              shifts={template.shifts}
              employees={
                filteredEmployees?.map((e) => {
                  const primaryAssignment =
                    e.location_assignments.find((a) => a.is_primary) ||
                    e.location_assignments[0];
                  const roleName = primaryAssignment?.role_name || "Staff";

                  return {
                    id: e.member_id,
                    fullName: e.display_name,
                    role: roleName,
                    user: { email: e.email },
                  };
                }) || []
              }
              onShiftPress={handleShiftPress}
              onAddShift={handleAddShift}
            />
          </div>
        </div>
      </div>

      {isShiftEditorOpen && selectedShift && (
        <ShiftModal
          open={isShiftEditorOpen}
          onOpenChange={setIsShiftEditorOpen}
          editShift={selectedShift as any}
          onSave={handleSaveShift}
          onDelete={() =>
            selectedShift.tempId && handleDeleteShift(selectedShift.tempId)
          }
          isTemplateMode={true}
          dayOfWeek={selectedShift.dayOfWeek}
        />
      )}
    </div>
  );
}
