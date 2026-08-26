"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_MODULE_COLOR,
  parseHexColor,
} from "@/lib/qr/branding-rules";
import {
  renderBrandedQrPngBlob,
  renderBrandedQrPngDataUrl,
  renderBrandedQrSvg,
  type BrandedQrOptions,
} from "@/lib/qr/render";
import {
  generateMissingQrCodesForLocation,
  generateQrCodeForTable,
  getQrTableManagerSnapshot,
  revokeTableQrCode,
  type QrTableManagerRow,
  type QrTableManagerSnapshot,
} from "../actions";
import { BrandedQrPreview } from "./BrandedQrPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Panel,
  PanelSection,
  StatRow,
  StatTile,
} from "@/components/dashboard/shell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { buildQrTableUrl } from "@/app/sites/lib/store-url";
import {
  Ban,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  Loader2,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";

interface QrTableManagerProps {
  locationId: string;
  locationName: string;
  storefrontEnabled: boolean;
  acceptsDineIn: boolean;
  qrKillSwitch: boolean;
  qrEntitled: boolean;
  qrGateMessage?: string | null;
}

function getStatusBadge(status: QrTableManagerRow["qrStatus"]) {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>;
    case "revoked":
      return <Badge variant="secondary">Revoked</Badge>;
    default:
      return <Badge variant="outline">Not generated</Badge>;
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

/**
 * `merchant` renders the store's own logo and brand colours; `dexa` renders the
 * neutral Dexa-blue code with no logo, for merchants who would rather not brand
 * their table tents.
 */
type QrBrandMode = "merchant" | "dexa";

const DEXA_BRAND_COLOR = "#0C4FD1";

/**
 * A branding failure must never leave the merchant with a silently unbranded
 * code — the ticket calls that out explicitly for the print path. Warnings are
 * raised once per export rather than per table so a bulk run does not bury the
 * screen in duplicates.
 */
function reportBrandingWarnings(warnings: string[]) {
  for (const warning of warnings) {
    toast.warning(warning, { duration: 8000 });
  }
}

const neutralQrToastStyle = {
  background: "#e5e7eb",
  borderColor: "#d1d5db",
  color: "#111827",
  "--success-bg": "#e5e7eb",
  "--success-border": "#d1d5db",
  "--success-text": "#111827",
} as CSSProperties;

function showQrGeneratedToast(message: string) {
  toast.success(message, {
    icon: <Check className="h-5 w-5 text-[#111827]" />,
    style: neutralQrToastStyle,
  });
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

function slugifyFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function QrTableManager({
  locationId,
  locationName,
  storefrontEnabled,
  acceptsDineIn,
  qrKillSwitch,
  qrEntitled,
  qrGateMessage,
}: QrTableManagerProps) {
  const [snapshot, setSnapshot] = useState<QrTableManagerSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [brandMode, setBrandMode] = useState<QrBrandMode>("merchant");
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const loadSnapshot = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getQrTableManagerSnapshot(locationId);
      setSnapshot(result);
      if (!result.success && result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load QR manager"
      );
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSnapshot();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadSnapshot]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, QrTableManagerRow[]>();
    for (const row of snapshot?.tables ?? []) {
      const key = row.zoneName || "Unassigned";
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return Array.from(groups.entries());
  }, [snapshot?.tables]);

  async function withBusy<T>(key: string, work: () => Promise<T>) {
    setBusyKey(key);
    try {
      return await work();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleGenerateMissing() {
    await withBusy("bulk-generate", async () => {
      // Each call is its own request with a fresh Clerk token, so a location
      // with hundreds of tables can never outlive a single JWT. The action is
      // idempotent — it always works off the tables still missing a code — so
      // looping until `remaining` hits zero is safe, and so is retrying.
      let totalGenerated = 0;

      try {
        for (;;) {
          const result = await generateMissingQrCodesForLocation(locationId);
          totalGenerated += result.generated;

          if (!result.success) {
            setBulkProgress(null);
            toast.error(
              totalGenerated > 0
                ? `Generated ${totalGenerated} QR code${totalGenerated === 1 ? "" : "s"}, then stopped: ${result.error ?? "unknown error"}`
                : result.error || "Failed to generate QR codes"
            );
            await loadSnapshot();
            return;
          }

          if (result.remaining <= 0) break;

          setBulkProgress({
            done: totalGenerated,
            total: totalGenerated + result.remaining,
          });

          // A batch that generates nothing while still reporting work left
          // would spin forever — bail instead of hanging the button.
          if (result.generated === 0) break;
        }

        toast.success(
          totalGenerated > 0
            ? `Generated ${totalGenerated} QR code${totalGenerated === 1 ? "" : "s"}`
            : "No missing QR codes to generate"
        );
        await loadSnapshot();
      } finally {
        setBulkProgress(null);
      }
    });
  }

  async function handleGenerate(row: QrTableManagerRow, regenerate = false) {
    const busyLabel = regenerate ? `regen-${row.floorPlanObjectId}` : `gen-${row.floorPlanObjectId}`;
    await withBusy(busyLabel, async () => {
      const result = await generateQrCodeForTable(row.floorPlanObjectId, {
        regenerate,
      });
      if (!result.success) {
        toast.error(result.error || `Failed to update ${row.tableLabel}`);
        return;
      }
      if (result.action === "reprint_existing") {
        showQrGeneratedToast(`Existing QR is ready to reprint for ${row.tableLabel}`);
      } else if (regenerate) {
        showQrGeneratedToast(`QR regenerated for ${row.tableLabel}`);
      } else {
        showQrGeneratedToast(`QR generated for ${row.tableLabel}`);
      }
      await loadSnapshot();
    });
  }

  async function handleRevoke(row: QrTableManagerRow) {
    await withBusy(`revoke-${row.floorPlanObjectId}`, async () => {
      const result = await revokeTableQrCode(row.floorPlanObjectId);
      if (!result.success) {
        toast.error(result.error || `Failed to revoke ${row.tableLabel}`);
        return;
      }
      toast.success(`QR revoked for ${row.tableLabel}`);
      await loadSnapshot();
    });
  }

  function getRowQrUrl(row: QrTableManagerRow) {
    return (
      row.qrUrl ||
      buildQrTableUrl({
        slug: snapshot?.storeSlug,
        customDomain: snapshot?.customDomain,
        token: row.tableToken,
      })
    );
  }

  function getRowFileBaseName(row: QrTableManagerRow) {
    const storeName = snapshot?.storeName || locationName || "store";
    return `${slugifyFileName(storeName)}-${slugifyFileName(row.tableLabel || "table")}`;
  }

  /**
   * The branding every export path shares. Deriving it in one place is what
   * keeps the dashboard preview, the SVG/PNG downloads and the printed table
   * tent from drifting apart.
   */
  const qrBranding = useMemo((): Omit<BrandedQrOptions, "value"> => {
    if (brandMode === "dexa") {
      return {
        logoUrl: null,
        moduleColor: DEXA_BRAND_COLOR,
        backgroundColor: DEFAULT_BACKGROUND_COLOR,
        secondaryColor: null,
      };
    }

    return {
      logoUrl: snapshot?.branding?.logoUrl ?? null,
      moduleColor: snapshot?.branding?.primaryColor ?? DEFAULT_MODULE_COLOR,
      backgroundColor:
        snapshot?.branding?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
      secondaryColor: snapshot?.branding?.secondaryColor ?? null,
    };
  }, [brandMode, snapshot?.branding]);

  const hasMerchantLogo = Boolean(snapshot?.branding?.logoUrl);

  /**
   * The preview needs a real encoded URL so it reflects the true module count
   * — a placeholder string of a different length would render a different-sized
   * grid and mislead about how tight the print will be.
   */
  const previewQrUrl = useMemo(() => {
    const firstActive = snapshot?.tables.find((row) => row.qrUrl);
    return firstActive?.qrUrl ?? null;
  }, [snapshot?.tables]);

  function getBrandTitle() {
    if (brandMode === "dexa") return "DEXA";
    return snapshot?.storeName || locationName || "Store";
  }

  function getBrandSubtitle() {
    return brandMode === "dexa" ? "Scan to order" : "Table ordering";
  }

  async function handleCopyLink(row: QrTableManagerRow) {
    const qrUrl = getRowQrUrl(row);
    if (!qrUrl) {
      toast.error("QR URL is not ready for this table yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(qrUrl);
      toast.success(`Guest link copied for ${row.tableLabel}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to copy the guest link"
      );
    }
  }

  async function handleDownloadSvg(row: QrTableManagerRow) {
    const qrUrl = getRowQrUrl(row);
    if (!qrUrl) {
      toast.error("QR URL is not ready for this table yet.");
      return;
    }

    try {
      const { data: svg, warnings } = await renderBrandedQrSvg({
        ...qrBranding,
        value: qrUrl,
      });
      reportBrandingWarnings(warnings);
      downloadBlob(
        new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
        `${getRowFileBaseName(row)}.svg`
      );
      toast.success(`SVG downloaded for ${row.tableLabel}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export SVG"
      );
    }
  }

  async function handleDownloadPng(row: QrTableManagerRow) {
    const qrUrl = getRowQrUrl(row);
    if (!qrUrl) {
      toast.error("QR URL is not ready for this table yet.");
      return;
    }

    try {
      const { data: blob, warnings } = await renderBrandedQrPngBlob({
        ...qrBranding,
        value: qrUrl,
        sizePx: 1200,
      });
      reportBrandingWarnings(warnings);
      downloadBlob(blob, `${getRowFileBaseName(row)}.png`);
      toast.success(`PNG downloaded for ${row.tableLabel}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export PNG"
      );
    }
  }

  async function buildPdfBlob(row: QrTableManagerRow) {
    const qrUrl = getRowQrUrl(row);
    if (!qrUrl) {
      throw new Error("QR URL is not ready for this table yet.");
    }

    // The printed tent goes through the same renderer as the on-screen
    // preview. If this ever forks again, branded-on-screen /
    // unbranded-on-paper comes straight back.
    const {
      data: qrImage,
      warnings,
      branding,
    } = await renderBrandedQrPngDataUrl({
      ...qrBranding,
      value: qrUrl,
      sizePx: 1400,
    });
    reportBrandingWarnings(warnings);

    // Panel chrome follows the same colour the modules ended up with, so a
    // fallback to safe defaults degrades the whole sheet coherently rather
    // than leaving Dexa blue framing a black-and-white code.
    const chrome = parseHexColor(branding.moduleColor) ?? { r: 12, g: 79, b: 209 };

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "letter",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const panelWidth = pageWidth / 2;
    const brandTitle = getBrandTitle();
    const brandSubtitle = getBrandSubtitle();
    const title = row.tableLabel;

    const renderPanel = (originX: number) => {
      doc.setDrawColor(chrome.r, chrome.g, chrome.b);
      doc.setLineWidth(0.5);
      doc.roundedRect(originX + 8, 10, panelWidth - 16, pageHeight - 20, 4, 4);
      doc.setFillColor(chrome.r, chrome.g, chrome.b);
      doc.roundedRect(originX + 8, 10, panelWidth - 16, 16, 4, 4, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text(brandTitle, originX + 14, 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(brandSubtitle, originX + 14, 24);

      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text(title, originX + panelWidth / 2, 41, { align: "center" });

      doc.addImage(qrImage, "PNG", originX + panelWidth / 2 - 28, 47, 56, 56);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Scan to order", originX + panelWidth / 2, 111, {
        align: "center",
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("Pay on your phone. Your order will be run to this table.", originX + panelWidth / 2, 117, {
        align: "center",
      });
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7.5);
      doc.text(qrUrl, originX + panelWidth / 2, 123, {
        align: "center",
        maxWidth: panelWidth - 24,
      });
    };

    renderPanel(0);
    renderPanel(panelWidth);

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.2);
    for (let y = 6; y < pageHeight - 6; y += 4) {
      doc.line(panelWidth, y, panelWidth, y + 2);
    }

    return doc.output("blob");
  }

  async function handleDownloadPdf(row: QrTableManagerRow) {
    try {
      const blob = await buildPdfBlob(row);
      downloadBlob(blob, `${getRowFileBaseName(row)}-table-tent.pdf`);
      toast.success(`PDF downloaded for ${row.tableLabel}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export PDF"
      );
    }
  }

  async function handlePrintPdf(row: QrTableManagerRow) {
    try {
      const blob = await buildPdfBlob(row);
      const url = URL.createObjectURL(blob);
      // With `noopener`, browsers are allowed to return null even after they
      // successfully open the tab. That produced a false “pop-up blocked”
      // toast for the PDF preview. Open first so the return value accurately
      // represents a blocked pop-up, then sever the opener relationship.
      const printWindow = window.open(url, "_blank");
      if (!printWindow) {
        URL.revokeObjectURL(url);
        toast.error("Pop-up blocked while opening the print preview.");
        return;
      }
      printWindow.opener = null;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(`Print preview opened for ${row.tableLabel}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to prepare print preview"
      );
    }
  }

  function handlePreview(row: QrTableManagerRow) {
    if (!storefrontEnabled) {
      toast.error(
        "Online Ordering must be enabled before guest preview or QR scans can work for this store."
      );
      return;
    }

    const qrUrl = getRowQrUrl(row);
    if (!qrUrl) {
      toast.error("QR preview URL is not ready for this table yet.");
      return;
    }

    // See the PDF preview: `noopener` can return null even when the browser
    // did open the tab, which makes the blocked-pop-up check unreliable.
    const previewWindow = window.open(qrUrl, "_blank");
    if (!previewWindow) {
      toast.error("Pop-up blocked while opening the guest preview.");
      return;
    }
    previewWindow.opener = null;

    toast.success(`Guest preview opened for ${row.tableLabel}`);
  }

  return (
    <Panel>
      <PanelSection
        icon={QrCode}
        label="QR code manager"
        caption={`Generate, preview, export, regenerate, and revoke table QR codes for ${locationName}.`}
        action={
          <div className="flex min-w-0 flex-wrap gap-2">
            {/* Segmented control → the pill rail used for tabs (DS-CTL-05).
                The active half was `bg-primary`, which is violet, not the
                brand blue (C5). */}
            <div className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted/70 p-1 text-xs">
              <button
                type="button"
                onClick={() => setBrandMode("merchant")}
                aria-pressed={brandMode === "merchant"}
                className={cn(
                  "rounded-full px-3 py-1 font-medium transition-colors",
                  brandMode === "merchant"
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Merchant
              </button>
              <button
                type="button"
                onClick={() => setBrandMode("dexa")}
                aria-pressed={brandMode === "dexa"}
                className={cn(
                  "rounded-full px-3 py-1 font-medium transition-colors",
                  brandMode === "dexa"
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                DEXA
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadSnapshot()}
              disabled={isLoading || busyKey !== null}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => void handleGenerateMissing()}
              disabled={isLoading || busyKey !== null || !qrEntitled}
            >
              {busyKey === "bulk-generate" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ScanLine className="mr-2 h-4 w-4" />
              )}
              {bulkProgress
                ? `Generating ${bulkProgress.done} of ${bulkProgress.total}`
                : "Generate Missing"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">

        {/* Three tinted wells → one hairline-separated StatRow (DS-CTL-07),
            matching the figures on every other converted page. */}
        <StatRow columns={3}>
          <StatTile label="Tables" value={snapshot?.tables.length ?? 0} />
          <StatTile label="Generated" value={snapshot?.generatedCount ?? 0} />
          <StatTile label="Active" value={snapshot?.activeCount ?? 0} />
        </StatRow>

        <div className="flex flex-col gap-4 rounded-2xl border bg-muted/40 p-4 sm:flex-row sm:items-center">
          <BrandedQrPreview value={previewQrUrl} branding={qrBranding} />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">
              {brandMode === "dexa"
                ? "Dexa branding"
                : hasMerchantLogo
                  ? "Your logo and brand colours"
                  : "Your brand colours"}
            </p>
            <p className="text-sm text-muted-foreground">
              {brandMode === "dexa"
                ? "Codes print in Dexa blue with no logo."
                : hasMerchantLogo
                  ? "Every download and printed table tent uses this exact artwork."
                  : "Add a logo in Online Store settings to place it at the centre of every code."}
            </p>
            {brandMode === "merchant" && hasMerchantLogo ? (
              <p className="text-xs text-muted-foreground">
                Scan this preview with your phone before printing a full run.
              </p>
            ) : null}
          </div>
        </div>

        {!acceptsDineIn ? (
          <div className="rounded-2xl border-0 bg-muted px-4 py-3 text-sm text-foreground shadow-none">
            QR scan handling is currently disabled for this store. You can still prepare codes here, but guests will not be allowed to order from scans until <span className="font-medium">Enable QR Table Ordering</span> is turned on above.
          </div>
        ) : null}

        {!storefrontEnabled ? (
          <div className="rounded-2xl border-0 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-none dark:bg-amber-900/20 dark:text-amber-200">
            The main online store is currently disabled. QR preview and real guest scans will fail closed until <span className="font-medium">Enable Online Ordering</span> is turned on for this location.
          </div>
        ) : null}

        {!qrEntitled ? (
          <div className="rounded-2xl border-0 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-none dark:bg-amber-900/20 dark:text-amber-200">
            {qrGateMessage ||
              "QR Table Ordering is not available for the current subscription tier."}
          </div>
        ) : null}

        {qrKillSwitch ? (
          <div className="rounded-2xl border-0 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-none">
            QR kill switch is active. Existing codes remain visible here, but new guest scans should fail closed until the switch is turned off.
          </div>
        ) : null}

        {snapshot && !snapshot.success && snapshot.error ? (
          <div className="rounded-2xl border-0 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-none">
            {snapshot.error}
          </div>
        ) : null}
        {isLoading ? (
          <div
            className="flex items-center gap-2 rounded-2xl border-0 bg-muted/60 px-4 py-8 text-sm text-muted-foreground shadow-none"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading table QR manager...
          </div>
        ) : null}

        {!isLoading && (snapshot?.tables.length ?? 0) === 0 ? (
          <div className="rounded-2xl border-0 bg-muted/60 px-4 py-8 text-sm text-muted-foreground shadow-none">
            No active tables or booths were found for this location. Add floor-plan tables first, then come back here to generate QR codes.
          </div>
        ) : null}

        {!isLoading &&
          groupedRows.map(([zoneName, rows]) => (
            // Borderless: this bordered card sat inside the panel, and each of
            // its table rows drew a third frame. With 236 tables that was a
            // wall of nested boxes running thousands of pixels tall.
            <div key={zoneName} className="min-w-0 space-y-3">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold">{zoneName}</h3>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {rows.length} table{rows.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 tabular-nums">
                  {rows.filter((row) => row.qrStatus === "active").length} active
                </Badge>
              </div>

              {/* Hairline-divided rows in a capped scroller: a zone with 236
                  tables is now a fixed-height list instead of the page. */}
              <div className="thin-scrollbar min-w-0 max-h-[32rem] divide-y divide-border/60 overflow-y-auto rounded-2xl border-0 bg-muted/40 px-3 shadow-none">
                {rows.map((row) => {
                  const isBusy =
                    busyKey === `gen-${row.floorPlanObjectId}` ||
                    busyKey === `regen-${row.floorPlanObjectId}` ||
                    busyKey === `revoke-${row.floorPlanObjectId}`;

                  return (
                    <div
                      key={row.floorPlanObjectId}
                      className="flex min-w-0 flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{row.tableLabel}</p>
                          {getStatusBadge(row.qrStatus)}
                          {row.capacity ? (
                            <Badge variant="outline">Seats {row.capacity}</Badge>
                          ) : null}
                          {row.tokenVersion ? (
                            <Badge variant="secondary">v{row.tokenVersion}</Badge>
                          ) : null}
                        </div>

                        <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                          <p>Scans (7d): <span className="font-medium text-foreground">{row.scanCount7d}</span></p>
                          <p>Scans (all): <span className="font-medium text-foreground">{row.scanCountLifetime}</span></p>
                          <p>Generated: <span className="font-medium text-foreground">{formatDateTime(row.generatedAt)}</span></p>
                          <p>Last scanned: <span className="font-medium text-foreground">{formatDateTime(row.lastScannedAt)}</span></p>
                        </div>
                      </div>

                      <div className="grid w-full grid-cols-2 gap-2 sm:w-64 lg:w-64 [&_button]:w-full [&_button]:justify-start [&_button]:px-2 [&_button]:text-xs">
                        {row.qrStatus === "not_generated" ? (
                          <Button
                            size="sm"
                            className="col-start-2"
                            onClick={() => void handleGenerate(row, false)}
                            disabled={busyKey !== null || !qrEntitled}
                          >
                            {isBusy ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <QrCode className="mr-2 h-4 w-4" />
                            )}
                            Generate
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleGenerate(row, false)}
                              disabled={busyKey !== null || !qrEntitled}
                            >
                              {isBusy && busyKey?.startsWith("gen-") ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                              )}
                              Reprint
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleGenerate(row, true)}
                              disabled={busyKey !== null || !qrEntitled}
                            >
                              {isBusy && busyKey?.startsWith("regen-") ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="mr-2 h-4 w-4" />
                              )}
                              Regenerate
                            </Button>
                            {row.qrStatus === "active" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleRevoke(row)}
                                disabled={busyKey !== null}
                              >
                                {isBusy && busyKey?.startsWith("revoke-") ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Ban className="mr-2 h-4 w-4" />
                                )}
                                Revoke
                              </Button>
                            ) : null}
                          </>
                        )}
                        {row.qrStatus !== "not_generated" ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!row.tableToken}
                              >
                                <Download className="mr-2 h-4 w-4" />
                                QR assets
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem
                                disabled={!storefrontEnabled}
                                onClick={() => handlePreview(row)}
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Preview guest view
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => void handleCopyLink(row)}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                Copy guest link
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => void handleDownloadSvg(row)}
                              >
                                <FileImage className="mr-2 h-4 w-4" />
                                Download SVG
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => void handleDownloadPng(row)}
                              >
                                <FileImage className="mr-2 h-4 w-4" />
                                Download PNG
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => void handleDownloadPdf(row)}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                Download PDF Tent
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => void handlePrintPdf(row)}
                              >
                                <Printer className="mr-2 h-4 w-4" />
                                Print PDF Tent
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

        <div className="rounded-2xl border-0 bg-muted px-4 py-3 text-sm text-foreground shadow-none">
          <p>
            Preview and export actions now use the shared store host contract and current table token. They still need end-to-end staging scan validation before the related ticket items are safe to close.
          </p>
        </div>
        </div>
      </PanelSection>
    </Panel>
  );
}
