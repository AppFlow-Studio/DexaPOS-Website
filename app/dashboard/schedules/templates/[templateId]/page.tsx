"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = React.use(params);
  const router = useRouter();
  const { templates, actions } = useScheduleTemplateStore();
  const { data: employees } = useUnifiedStaff();

  // Find template by ID
  const existingTemplate = templates.find((t) => t.id === templateId);

  const [template, setTemplate] = useState<Omit<
    ScheduleTemplate,
    "created_at"
  > | null>(null);
  const [isShiftEditorOpen, setIsShiftEditorOpen] = useState(false);
  const [selectedShift, setSelectedShift] =
    useState<Partial<TemplateShift> | null>(null);
  const [newShiftDefaults, setNewShiftDefaults] = useState<{
    employeeId: string;
    dayOfWeek: number;
    role: any;
  } | null>(null);
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

    setNewShiftDefaults({
      employeeId,
      dayOfWeek,
      role: "server",
    });
    setSelectedShift(null);
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

  const handleMoveShift = (
    tempId: string,
    targetEmployeeId: string,
    targetDayOfWeek: number
  ) => {
    setTemplate((prev) => {
      if (!prev) return null;
      const shifts = [...prev.shifts];
      const shiftIndex = shifts.findIndex((s) => s.tempId === tempId);
      if (shiftIndex === -1) return prev;

      // Update the shift
      shifts[shiftIndex] = {
        ...shifts[shiftIndex],
        employeeId: targetEmployeeId,
        dayOfWeek: targetDayOfWeek,
      };

      return { ...prev, shifts };
    });
  };

  const handleSave = () => {
    if (!template || !template.name.trim()) {
      return;
    }

    actions.updateTemplate(template.id, {
      name: template.name,
      description: template.description,
      tags: template.tags,
      shifts: template.shifts,
    });

    router.back();
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-foreground md:h-screen md:min-h-0">
      {/* Header */}
      <header className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
          <Button variant="outline" onClick={() => router.back()} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button onClick={handleSave} className="flex-1 sm:flex-none">
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row md:overflow-hidden">
        {/* Sidebar / Form */}
        <div className="w-full shrink-0 bg-white p-4 sm:p-6 md:w-80 md:overflow-y-auto">
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
        <div className="flex min-h-[560px] min-w-0 shrink-0 flex-col bg-white md:min-h-0 md:flex-1 md:shrink">
          {/* Search Bar */}
          <div className="flex items-center gap-4 bg-white p-4">
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

          <div className="h-[480px] overflow-hidden p-3 sm:p-6 md:h-auto md:min-h-0 md:flex-1">
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
              onMoveShift={handleMoveShift}
            />
          </div>
        </div>
      </div>

      {isShiftEditorOpen && (
        <ShiftModal
          open={isShiftEditorOpen}
          onOpenChange={setIsShiftEditorOpen}
          editShift={selectedShift as any}
          defaultEmployeeId={newShiftDefaults?.employeeId}
          defaultRole={newShiftDefaults?.role}
          onSave={handleSaveShift}
          onDelete={() =>
            selectedShift?.tempId && handleDeleteShift(selectedShift.tempId)
          }
          isTemplateMode={true}
          dayOfWeek={selectedShift?.dayOfWeek ?? newShiftDefaults?.dayOfWeek}
        />
      )}
    </div>
  );
}
