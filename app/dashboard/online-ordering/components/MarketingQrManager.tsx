"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  Download,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelSection } from "@/components/dashboard/shell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildMarketingQrUrl } from "@/app/sites/lib/store-url";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_MODULE_COLOR,
} from "@/lib/qr/branding-rules";
import {
  renderBrandedQrPngBlob,
  renderBrandedQrSvg,
  type BrandedQrOptions,
} from "@/lib/qr/render";

import { BrandedQrPreview } from "./BrandedQrPreview";
import { MarketingQrCreateDialog } from "./MarketingQrCreateDialog";
import {
  createMarketingQrCode,
  deactivateMarketingQrCode,
  getMarketingQrStoreContext,
  listMarketingQrCodes,
  type MarketingQrRow,
  type MarketingQrStoreContext,
} from "../marketing-qr-actions";

interface MarketingQrManagerProps {
  locationId: string;
  locationName: string;
  /** The storefront itself being off makes every printed code a dead end. */
  storefrontEnabled: boolean;
}

type StatusFilter = "all" | "active" | "inactive";

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All statuses",
  active: "Active",
  inactive: "Inactive",
};

/**
 * Stands in for a real short code while previewing a code that does not exist
 * yet.
 *
 * The length is what matters, not the characters: QR density follows payload
 * length, so ten characters here render the same grid a minted code will. A
 * placeholder of the wrong length would preview a denser or sparser code than
 * the merchant actually gets. Ten characters, and none of them I, L, O or U,
 * matching the `short_code` CHECK.
 */
const PREVIEW_SHORT_CODE = "XXXXXXXXXX";

function slugifyFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function reportBrandingWarnings(warnings: string[]) {
  for (const warning of warnings) {
    toast.warning(warning, { duration: 8000 });
  }
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Marketing QR codes — the code printed on a flyer, door decal or delivery bag.
 *
 * Rendered **outside** the `qrEntitled` gate on purpose. QR table ordering is a
 * billable multi-location dine-in feature; a flyer is not. Gating this would
 * lock out precisely the single-location merchants who print flyers. Do not
 * "tidy" this into the gated branch.
 *
 * Everything visual goes through the same `lib/qr/render` renderer the table
 * codes use, so a marketing code and a table code cannot end up branded
 * differently.
 */
export function MarketingQrManager({
  locationId,
  locationName,
  storefrontEnabled,
}: MarketingQrManagerProps) {
  const [rows, setRows] = useState<MarketingQrRow[]>([]);
  const [store, setStore] = useState<MarketingQrStoreContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The code awaiting confirmation. A printed flyer cannot be recalled, so
  // deactivation is worth a beat of friction — but through the app's own
  // dialog, not the browser's.
  const [pendingDeactivation, setPendingDeactivation] =
    useState<MarketingQrRow | null>(null);

  const load = useCallback(async () => {
    if (!locationId) return;
    setIsLoading(true);

    const [list, context] = await Promise.all([
      listMarketingQrCodes(locationId),
      getMarketingQrStoreContext(locationId),
    ]);

    setStore(context);
    setRows(list.success ? list.rows : []);
    if (!list.success && list.error) toast.error(list.error);
    setIsLoading(false);
  }, [locationId]);

  useEffect(() => {
    // Deferred by a tick rather than called inline: `load` sets state
    // synchronously, which inside an effect body cascades renders. Same shape
    // as QrTableManager's loader.
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  /**
   * The same branding the table codes render with, so the two cannot diverge.
   * There is no Dexa-branded mode here: a marketing code is the merchant's own
   * advertising, never ours.
   */
  const qrBranding = useMemo(
    (): Omit<BrandedQrOptions, "value"> => ({
      logoUrl: store?.branding?.logoUrl ?? null,
      moduleColor: store?.branding?.primaryColor ?? DEFAULT_MODULE_COLOR,
      backgroundColor:
        store?.branding?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
      secondaryColor: store?.branding?.secondaryColor ?? null,
    }),
    [store?.branding]
  );

  const codeUrl = useCallback(
    (row: MarketingQrRow) =>
      buildMarketingQrUrl({
        slug: store?.slug,
        customDomain: store?.customDomain,
        shortCode: row.shortCode,
      }),
    [store?.slug, store?.customDomain]
  );

  /** What a code created right now would resolve to, for the create preview. */
  const previewUrl = useMemo(
    () =>
      buildMarketingQrUrl({
        slug: store?.slug,
        customDomain: store?.customDomain,
        shortCode: PREVIEW_SHORT_CODE,
      }),
    [store?.slug, store?.customDomain]
  );

  const isFiltered = search.trim() !== "" || statusFilter !== "all";

  // Search the name and the short code both: a merchant holding a printed
  // flyer has the code in front of them and not much else.
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter === "active" && !row.isActive) return false;
      if (statusFilter === "inactive" && row.isActive) return false;
      if (!needle) return true;

      return (
        row.name.toLowerCase().includes(needle) ||
        row.shortCode.toLowerCase().includes(needle)
      );
    });
  }, [rows, search, statusFilter]);

  // Preview whatever the merchant last touched, else the newest live code —
  // a deactivated code is not what someone is about to print. Chosen from every
  // row, not the filtered ones, so narrowing the list does not blank the
  // preview of the code being looked at.
  const selected = useMemo(() => {
    const chosen = rows.find((row) => row.id === selectedId);
    return chosen ?? rows.find((row) => row.isActive) ?? null;
  }, [rows, selectedId]);

  const fileBase = useCallback(
    (row: MarketingQrRow) =>
      `${slugifyFileName(store?.storeName || locationName || "store")}-${slugifyFileName(row.name || "code")}`,
    [store?.storeName, locationName]
  );

  async function withBusy(key: string, work: () => Promise<void>) {
    setBusyKey(key);
    try {
      await work();
    } finally {
      setBusyKey(null);
    }
  }

  /** Resolves true when the code was created, which closes the dialog. */
  async function handleCreate(name: string): Promise<boolean> {
    let created = false;

    await withBusy("create", async () => {
      const result = await createMarketingQrCode(locationId, name);

      if (!result.success || !result.row) {
        toast.error(result.error ?? "Could not create the code.");
        return;
      }

      setRows((prev) => [result.row!, ...prev]);
      setSelectedId(result.row.id);
      // A new code must be visible the moment it lands, even if the filters in
      // force would have hidden it.
      setSearch("");
      setStatusFilter("all");
      created = true;
      toast.success(`“${result.row.name}” is ready to print.`);
    });

    return created;
  }

  async function handleDeactivate(row: MarketingQrRow) {
    await withBusy(`deactivate-${row.id}`, async () => {
      const result = await deactivateMarketingQrCode(locationId, row.id);

      if (!result.success || !result.row) {
        toast.error(result.error ?? "Could not deactivate this code.");
        return;
      }

      setRows((prev) =>
        prev.map((item) => (item.id === row.id ? result.row! : item))
      );
      setPendingDeactivation(null);
      toast.success(`“${row.name}” is no longer active.`);
    });
  }

  async function handleCopy(row: MarketingQrRow) {
    const url = codeUrl(row);
    if (!url) {
      toast.error("This store has no public address yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Link copied for “${row.name}”.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not copy the link."
      );
    }
  }

  async function handleDownload(row: MarketingQrRow, format: "svg" | "png") {
    const url = codeUrl(row);
    if (!url) {
      toast.error("This store has no public address yet.");
      return;
    }

    await withBusy(`${format}-${row.id}`, async () => {
      try {
        if (format === "svg") {
          const { data, warnings } = await renderBrandedQrSvg({
            ...qrBranding,
            value: url,
          });
          reportBrandingWarnings(warnings);
          downloadBlob(
            new Blob([data], { type: "image/svg+xml;charset=utf-8" }),
            `${fileBase(row)}.svg`
          );
        } else {
          const { data, warnings } = await renderBrandedQrPngBlob({
            ...qrBranding,
            value: url,
          });
          reportBrandingWarnings(warnings);
          downloadBlob(data, `${fileBase(row)}.png`);
        }

        toast.success(`${format.toUpperCase()} downloaded for “${row.name}”.`);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : `Could not export the ${format.toUpperCase()}.`
        );
      }
    });
  }

  const activeCount = rows.filter((row) => row.isActive).length;

  return (
    <Panel>
      <PanelSection
        icon={Megaphone}
        label="Marketing QR codes"
        caption={`Codes for flyers, decals and packaging at ${locationName}. These point at your storefront, not at a table.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={isLoading || busyKey !== null}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            {/* Lives here rather than in the toolbar below because the toolbar
                only appears once codes exist, and the first code has to be
                reachable too. */}
            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              disabled={busyKey !== null}
            >
              <Plus className="mr-2 h-4 w-4" />
              New code
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {!storefrontEnabled ? (
            <div className="rounded-2xl border-0 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-none dark:bg-amber-900/20 dark:text-amber-200">
              Your online store is switched off, so anyone scanning these codes
              will not be able to order. Turn on{" "}
              <span className="font-medium">Enable Online Ordering</span> before
              printing.
            </div>
          ) : null}

          <div className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-4 sm:flex-row sm:items-center">
            <BrandedQrPreview
              value={selected ? codeUrl(selected) : null}
              branding={qrBranding}
              label={
                selected
                  ? `Preview of the marketing QR code “${selected.name}”`
                  : "Preview of the marketing QR code"
              }
              emptyLabel="Choose New code to see the branded preview."
            />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">
                {selected ? selected.name : "No codes yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {selected
                  ? "Downloads use this exact artwork, in your brand colours."
                  : "Choose New code to make your first one."}
              </p>
              {selected ? (
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {codeUrl(selected) || "This store has no public address yet."}
                </p>
              ) : null}
            </div>
          </div>

          {!isLoading && rows.length > 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search codes by name or code"
                  aria-label="Search marketing codes"
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              >
                <SelectTrigger className="sm:w-48" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_FILTER_LABELS) as StatusFilter[]).map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {STATUS_FILTER_LABELS[value]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {isLoading ? (
            <div
              className="flex items-center gap-2 rounded-2xl border-0 bg-muted/60 px-4 py-8 text-sm text-muted-foreground shadow-none"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading marketing codes…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border-0 bg-muted/60 px-4 py-8 text-sm text-muted-foreground shadow-none">
              No marketing codes yet. Choose{" "}
              <span className="font-medium">New code</span>, then download it as
              an SVG for print or a PNG for social.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-2xl border-0 bg-muted/60 px-4 py-8 text-sm text-muted-foreground shadow-none">
              <p>No codes match this search.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground tabular-nums">
                {isFiltered
                  ? `Showing ${filteredRows.length} of ${rows.length}`
                  : `${activeCount} active · ${rows.length} total`}
              </p>
              <div className="divide-y divide-border/60 rounded-2xl border-0 bg-muted/40 px-3 shadow-none">
                {filteredRows.map((row) => {
                  const isBusy = busyKey?.endsWith(row.id) ?? false;

                  return (
                    <div
                      key={row.id}
                      className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between"
                      onMouseEnter={() => setSelectedId(row.id)}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{row.name}</span>
                          <Badge
                            variant={row.isActive ? "default" : "secondary"}
                          >
                            {row.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.shortCode}
                          </span>
                        </div>
                        <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
                          <p className="tabular-nums">
                            Scans:{" "}
                            <span className="font-medium text-foreground">
                              {row.scanCount}
                            </span>
                          </p>
                          <p>Last scan: {formatDate(row.lastScannedAt)}</p>
                          <p>Created: {formatDate(row.createdAt)}</p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedId(row.id)}
                        >
                          Preview
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" disabled={isBusy}>
                              {isBusy ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="mr-2 h-4 w-4" />
                              )}
                              QR assets
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              onClick={() => void handleCopy(row)}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy link
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void handleDownload(row, "svg")}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download SVG
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void handleDownload(row, "png")}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download PNG
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {row.isActive ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPendingDeactivation(row)}
                            disabled={isBusy}
                          >
                            Deactivate
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </PanelSection>

      <MarketingQrCreateDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        branding={qrBranding}
        previewUrl={previewUrl}
        isCreating={busyKey === "create"}
        onCreate={handleCreate}
      />

      <AlertDialog
        open={pendingDeactivation !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeactivation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Deactivate “{pendingDeactivation?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Anyone who scans a flyer, decal or bag already carrying this code
              will be told it is no longer active. Printed copies cannot be
              recalled, and this cannot be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyKey !== null}>
              Keep it active
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Deactivating is async and closes the dialog itself once the
                // row comes back, so the default close-on-click is suppressed.
                event.preventDefault();
                if (pendingDeactivation) {
                  void handleDeactivate(pendingDeactivation);
                }
              }}
              disabled={busyKey !== null}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {busyKey?.startsWith("deactivate-") ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
