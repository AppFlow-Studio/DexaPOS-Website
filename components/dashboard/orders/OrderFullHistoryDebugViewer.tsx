"use client";

import * as React from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronDown,
  Copy,
  Download,
  Search,
} from "lucide-react";
import type { OrderFullHistory } from "@/types/order-full-history";

const SECTION_IDS = {
  order: "order-header",
  items: "items",
  payments: "payments",
  reversals: "reversals",
  timeline: "timeline",
} as const;

const SECTION_LINKS: { id: string; label: string }[] = [
  { id: SECTION_IDS.order, label: "Order Header" },
  { id: SECTION_IDS.items, label: "Items" },
  { id: SECTION_IDS.payments, label: "Payments" },
  { id: SECTION_IDS.reversals, label: "Reversals" },
  { id: SECTION_IDS.timeline, label: "Timeline" },
];

function getSectionIdForKey(key: string): string | undefined {
  const k = key.toLowerCase();
  if (k === "order") return SECTION_IDS.order;
  if (k === "items") return SECTION_IDS.items;
  if (k === "payments") return SECTION_IDS.payments;
  if (k === "reversals") return SECTION_IDS.reversals;
  if (k === "timeline") return SECTION_IDS.timeline;
  return undefined;
}

/** Recursively check if any value in obj matches search (case-insensitive) */
function jsonMatchesSearch(obj: unknown, search: string): boolean {
  if (!search.trim()) return true;
  const q = search.toLowerCase();
  const str = JSON.stringify(obj).toLowerCase();
  return str.includes(q);
}

/** Filter object/array to only include paths that match search; returns null if no match */
function filterJsonBySearch(obj: unknown, search: string): unknown {
  if (!search.trim()) return obj;
  const q = search.toLowerCase();

  if (obj === null || typeof obj !== "object") {
    return jsonMatchesSearch(obj, search) ? obj : null;
  }

  if (Array.isArray(obj)) {
    const filtered = obj
      .map((item) => filterJsonBySearch(item, search))
      .filter((x) => x !== null && x !== undefined);
    if (filtered.length === 0 && !jsonMatchesSearch(obj, search)) return null;
    return filtered.length > 0 ? filtered : obj;
  }

  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const child = filterJsonBySearch(v, search);
    if (child !== null || jsonMatchesSearch(k, search)) {
      filtered[k] = child ?? v;
    }
  }
  if (Object.keys(filtered).length === 0 && !jsonMatchesSearch(obj, search))
    return null;
  return Object.keys(filtered).length > 0 ? filtered : obj;
}

function JsonNode({
  data,
  keyName,
  depth,
  defaultOpen,
  sectionId,
  searchQuery,
}: {
  data: unknown;
  keyName?: string;
  depth: number;
  defaultOpen: boolean;
  sectionId?: string;
  searchQuery: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const isObject = data !== null && typeof data === "object";
  const isArray = Array.isArray(data);

  const highlightMatch =
    searchQuery.trim() &&
    keyName &&
    keyName.toLowerCase().includes(searchQuery.toLowerCase());

  if (!isObject) {
    const val =
      data === null
        ? "null"
        : typeof data === "string"
          ? JSON.stringify(data)
          : String(data);
    return (
      <div className="flex items-baseline gap-1 font-mono text-xs">
        {keyName != null && (
          <span className="text-amber-700 dark:text-amber-400">
            &quot;{keyName}&quot;
          </span>
        )}
        {keyName != null && <span className="text-muted-foreground">: </span>}
        <span
          className={cn(
            data === null && "text-muted-foreground",
            typeof data === "number" && "text-blue-600 dark:text-blue-400",
            typeof data === "boolean" && "text-purple-600 dark:text-purple-400",
            typeof data === "string" && "text-emerald-600 dark:text-emerald-400"
          )}
        >
          {val}
        </span>
      </div>
    );
  }

  const entries = isArray
    ? (data as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(data as Record<string, unknown>);
  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div id={sectionId} className="scroll-mt-4">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1 font-mono text-xs hover:bg-muted/50 rounded px-0.5 -mx-0.5 py-0.5 -my-0.5 transition-colors text-left",
              highlightMatch && "ring-1 ring-primary/50 rounded"
            )}
          >
            {open ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            {keyName != null && (
              <span className="text-amber-700 dark:text-amber-400">
                &quot;{keyName}&quot;
              </span>
            )}
            {keyName != null && (
              <span className="text-muted-foreground">: </span>
            )}
            <span className="text-muted-foreground">
              {bracketOpen}
              {!open && (
                <span className="text-muted-foreground/70">
                  {entries.length} {isArray ? "items" : "keys"}
                  …
                </span>
              )}
              {bracketClose}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pl-4 border-l border-border/60 ml-1.5 mt-0.5 space-y-0.5">
            {entries.map(([k, v]) => (
              <JsonNode
                key={k}
                data={v}
                keyName={isArray ? undefined : k}
                depth={depth + 1}
                defaultOpen={false}
                sectionId={
                  depth === 0 && !isArray
                    ? getSectionIdForKey(k)
                    : undefined
                }
                searchQuery={searchQuery}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function OrderFullHistoryDebugViewer({
  data,
  orderId,
}: {
  data: OrderFullHistory | null;
  orderId?: string;
}) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const filtered = React.useMemo(() => {
    if (!data) return null;
    return filterJsonBySearch(data, searchQuery) ?? data;
  }, [data, searchQuery]);

  const jsonString = React.useMemo(
    () => (data ? JSON.stringify(data, null, 2) : ""),
    [data]
  );

  const handleCopy = React.useCallback(() => {
    if (!jsonString) return;
    void navigator.clipboard.writeText(jsonString);
  }, [jsonString]);

  const handleDownload = React.useCallback(() => {
    if (!jsonString) return;
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `order-full-history-${orderId ?? "unknown"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonString, orderId]);

  const scrollToSection = React.useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  if (!data) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Full response from{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          get_order_full_history
        </code>
      </p>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-[240px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search in JSON..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {SECTION_LINKS.map(({ id, label }) => (
            <Button
              key={id}
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => scrollToSection(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleCopy}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>

      {/* JSON Tree */}
      <div
        ref={containerRef}
        className="rounded-lg border bg-muted/30 p-4 overflow-auto max-h-[600px] font-mono text-xs"
      >
        <JsonNode
          data={filtered}
          depth={0}
          defaultOpen={true}
          searchQuery={searchQuery}
        />
      </div>
    </div>
  );
}
