import { Button } from "@/components/ui/button";
import { ApplyMode } from "@/types/schedule";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ApplyTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  templateName: string;
  shiftsToAdd: number;
  conflictsDetected: number;
  applyMode: ApplyMode;
  onApplyModeChange: (mode: ApplyMode) => void;
  onApply: () => void;
}

const APPLY_MODES: {
  value: ApplyMode;
  label: string;
  description: string;
}[] = [
  {
    value: "merge",
    label: "Merge",
    description: "Keep existing shifts, add new ones.",
  },
  {
    value: "replace-all",
    label: "Replace All",
    description: "Delete all existing shifts and replace with template.",
  },
  {
    value: "fill-gaps",
    label: "Fill Gaps",
    description:
      "Only add shifts into empty slots, strictly avoiding conflicts.",
  },
];

export function ApplyTemplateDialog({
  isOpen,
  onClose,
  templateName,
  shiftsToAdd,
  conflictsDetected,
  applyMode,
  onApplyModeChange,
  onApply,
}: ApplyTemplateDialogProps) {
  const currentMode = APPLY_MODES.find((m) => m.value === applyMode)!;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply Template: {templateName}</DialogTitle>
          <DialogDescription>
            Choose how you want to apply this schedule template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Application Mode</label>
            <Select
              value={applyMode}
              onValueChange={(v) => onApplyModeChange(v as ApplyMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLY_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{mode.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {mode.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border p-3 bg-muted/50 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>{shiftsToAdd} shifts will be added</span>
            </div>
            {conflictsDetected > 0 && (
              <div className="flex items-center gap-2 text-sm text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                <span>{conflictsDetected} potential conflicts detected</span>
              </div>
            )}
            {applyMode === "replace-all" && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <Info className="h-4 w-4" />
                <span>Warning: All existing shifts will be deleted.</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onApply}>Apply Template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
