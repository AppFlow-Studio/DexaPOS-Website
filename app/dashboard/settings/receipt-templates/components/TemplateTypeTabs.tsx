import { cn } from "@/lib/utils";
import { TEMPLATE_TYPES } from "../constants";
import type { TemplateType } from "../types";

interface TemplateTypeTabsProps {
  activeTab: TemplateType;
  onChange: (tab: TemplateType) => void;
}

export function TemplateTypeTabs({
  activeTab,
  onChange,
}: TemplateTypeTabsProps) {
  return (
    <div className="flex gap-1 border-b overflow-x-auto">
      {TEMPLATE_TYPES.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
