import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore";
import { format } from "date-fns";
import { Copy, Trash2, Calendar, Play } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TemplateManagerProps {
  onApply: (templateId: string) => void;
  children?: React.ReactNode; // Button trigger
}

export function TemplateManager({ onApply, children }: TemplateManagerProps) {
  const { templates, actions } = useScheduleTemplateStore();

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" className="gap-2">
            <Copy className="h-4 w-4" />
            Templates
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Schedule Templates</DialogTitle>
          <DialogDescription>
            Manage and apply your saved shift patterns.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {templates.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border border-dashed rounded-lg">
                <Copy className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p>No templates saved yet.</p>
                <p className="text-sm">
                  Save a weekly schedule as a template to see it here.
                </p>
              </div>
            ) : (
              templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{template.name}</h4>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {template.shifts.length} shifts
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {template.description || "No description"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created{" "}
                      {format(new Date(template.created_at), "MMM d, yyyy")}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => onApply(template.id)}
                      className="gap-2"
                    >
                      <Play className="h-3 w-3" />
                      Apply
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => actions.deleteTemplate(template.id)}
                        >
                          Delete Template
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
