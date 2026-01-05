import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore";
import { Shift } from "@/types/schedule";
import { useState } from "react";

interface SaveTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shiftsToSave: Shift[];
}

export function SaveTemplateDialog({
  isOpen,
  onClose,
  shiftsToSave,
}: SaveTemplateDialogProps) {
  const { actions } = useScheduleTemplateStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSave = () => {
    if (!name.trim()) return;

    // Sanitize shifts for template storage (remove specific dates/employees if needed,
    // but usually we keep time and role. Employee might be kept or cleared depending on preference.
    // Ideally templates are role-based, but maintaining specific employee assignments is a valid use case.)
    const templateShifts = shiftsToSave.map(
      ({ id, employee_name, ...rest }) => ({
        ...rest,
        // Date in template is usually relative.
        // However, our simple store implementation just stores the full shift object.
        // Real implementation might normalize dates to a base week (e.g. 1970-01-01 week)
        // For now, we store as is, and `applyTemplate` logic handles the date shifting.
      })
    );

    actions.addTemplate({
      name,
      description,
      shifts: templateShifts,
      created_at: new Date().toISOString(),
    });

    setName("");
    setDescription("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            Save the current week's schedule as a reusable template.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name</Label>
            <Input
              id="name"
              placeholder="e.g. Standard Summer Week"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Description (Optional)</Label>
            <Textarea
              id="desc"
              placeholder="Notes about this schedule pattern..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            Saving <strong>{shiftsToSave.length}</strong> shifts.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
