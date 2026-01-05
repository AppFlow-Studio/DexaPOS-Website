"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Settings, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore";

interface TemplateDrawerProps {
  onApplyTemplate: (templateId: string) => void;
  className?: string; // Allow positioning customization
}

export const TemplateDrawer: React.FC<TemplateDrawerProps> = ({
  onApplyTemplate,
  className,
}) => {
  const router = useRouter();
  const { templates, activeTemplateIds } = useScheduleTemplateStore();

  const activeTemplates = useMemo(() => {
    return templates.filter((t) => activeTemplateIds.includes(t.id));
  }, [templates, activeTemplateIds]);

  return (
    <div className={`w-64 bg-background border-l flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Templates</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Quick access to active templates
        </p>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 p-4">
        {activeTemplates.length > 0 ? (
          <div className="space-y-3">
            {activeTemplates.map((template) => (
              <div
                key={template.id}
                className="group p-3 rounded-lg border bg-card hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer"
                onClick={() => onApplyTemplate(template.id)}
              >
                <div className="font-medium text-sm text-foreground mb-1">
                  {template.name}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mb-2">
                  {template.description || "No description"}
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{template.shifts.length} shifts</span>
                  <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Apply
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 px-2">
            <p className="text-sm text-muted-foreground mb-2">
              No active templates
            </p>
            <p className="text-xs text-muted-foreground">
              Select templates in the library to see them here.
            </p>
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t mt-auto">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => router.push("/dashboard/schedules/templates")}
        >
          <Settings className="w-3.5 h-3.5" />
          Manage Templates
        </Button>
      </div>
    </div>
  );
};
