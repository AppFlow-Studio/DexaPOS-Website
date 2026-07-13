"use client";

import React, { useState, useMemo } from "react";
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

// Mock predefined tags if not found
const TAGS = [
  "Morning",
  "Evening",
  "Weekend",
  "Holiday",
  "Minimal",
  "Full Staff",
];

export default function CreateTemplatePage() {
  const router = useRouter();
  const { actions } = useScheduleTemplateStore();
  const { data: employees } = useUnifiedStaff(); // Updated hook usage

  const [template, setTemplate] = useState<
    Omit<ScheduleTemplate, "created_at">
  >({
    id: crypto.randomUUID(), // Temp ID
    name: "",
    description: "",
    tags: [],
    shifts: [],
  });

  const [isShiftEditorOpen, setIsShiftEditorOpen] = useState(false);
  const [selectedShift, setSelectedShift] =
    useState<Partial<TemplateShift> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter((emp) =>
      emp.display_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [employees, searchQuery]);

  // Form Handlers
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTemplate((prev) => ({ ...prev, name: e.target.value }));
  };

  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setTemplate((prev) => ({ ...prev, description: e.target.value }));
  };

  const handleToggleTag = (tag: string) => {
    setTemplate((prev) => {
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
      startTime: new Date().toISOString(), // Default time, to be set by editor
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
      const existingIndex = prev.shifts.findIndex(
        (s) => s.tempId === savedShift.tempId
      );
      let newShifts = [...prev.shifts];

      const fullShift = savedShift as TemplateShift;

      // If reusing ShiftEditorModal, it might return Date objects or strings.
      // We'll need to confirm what ShiftEditorModal returns.

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
    setTemplate((prev) => ({
      ...prev,
      shifts: prev.shifts.filter((s) => s.tempId !== tempId),
    }));
    setIsShiftEditorOpen(false);
  };

  const handleMoveShift = (
    tempId: string,
    targetEmployeeId: string,
    targetDayOfWeek: number
  ) => {
    setTemplate((prev) => ({
      ...prev,
      shifts: prev.shifts.map((s) =>
        s.tempId === tempId
          ? { ...s, employeeId: targetEmployeeId, dayOfWeek: targetDayOfWeek }
          : s
      ),
    }));
  };

  const handleSave = () => {
    if (!template.name.trim()) {
      toast("Name Required", {
        description: "Please enter a name for the template before saving.",
      });
      return;
    }

    // Prepare final object
    const finalTemplate: Omit<ScheduleTemplate, "id"> = {
      name: template.name,
      description: template.description,
      tags: template.tags,
      shifts: template.shifts,
      created_at: new Date().toISOString(),
      lastUsed: new Date(),
    };

    actions.addTemplate(finalTemplate);
    toast("Template Created", {
      description: `The template "${template.name}" has been successfully created.`,
    });
    router.back();
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <header className="flex flex-col gap-3 px-4 py-4 border-b sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Create Template</h1>
            <p className="text-sm text-muted-foreground">
              Define a reusable weekly schedule
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} className="flex-1 sm:flex-none">
            <Save className="w-4 h-4 mr-2" />
            Save Template
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Sidebar / Form */}
        <div className="w-full md:w-80 border-b md:border-b-0 md:border-r p-4 sm:p-6 overflow-y-auto bg-muted/10 shrink-0">
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

            <div className="pt-4 border-t">
              <label className="text-sm font-medium mb-2 block">
                Unassigned Shifts
              </label>
              <p className="text-xs text-muted-foreground">
                Drag and drop shifts here to unassign them (Coming Soon)
              </p>
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

          <div className="flex-1 p-3 sm:p-6 overflow-auto min-w-0">
            <TemplateGrid
              shifts={template.shifts}
              // Adapt employees to what TemplateGrid expects
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

      {isShiftEditorOpen && selectedShift && (
        <ShiftModal
          open={isShiftEditorOpen}
          onOpenChange={setIsShiftEditorOpen}
          editShift={selectedShift as any} // Temporary cast
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
