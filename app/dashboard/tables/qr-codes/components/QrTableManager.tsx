"use client";

import Link from "next/link";
import { type CSSProperties, useMemo, useState } from "react";
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
  revokeTableQrCode,
  type QrTableManagerRow,
  type QrTableManagerSnapshot,
} from "@/app/dashboard/online-ordering/actions";
import { BrandedQrPreview } from "@/components/dashboard/qr/BrandedQrPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { buildQrTableUrl } from "@/app/sites/lib/store-url";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileImage,
  FileText,
  Loader2,
  MoreHorizontal,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
} from "lucide-react";
import { toast } from "sonner";

/**
 * The snapshot is owned by the page, not by this component. It used to load
 * its own rows while the storefront flags and the billing gate arrived as
 * props from the online-ordering settings store — two fetches that could
 * disagree about whether the rows on screen were gated. One fetch now feeds
 * the rows, the banners and the sibling analytics panel alike.
 */
interface QrTableManagerProps {
  locationId: string;
  /**
   * The branch name as the location store already knows it, so the heading
   * reads correctly on first paint instead of after the round trip. The
   * snapshot's own `locationName` wins once it arrives.
   */
  fallbackLocationName: string;
  snapshot: QrTableManagerSnapshot | null;
  isLoading: boolean;
  refresh: () => Promise<unknown>;
}

type StatusFilter = "all" | QrTableManagerRow["qrStatus"];

/**
 * Rows rendered per zone before paging. Every row used to mount at once: a
 * real location with 233 tables put 634 buttons and 233 dropdowns in the DOM,
 * inside a 512px box holding 20,000px of scroll. This caps both.
 */
const ROWS_PER_PAGE = 25;

type SortKey =
  | "tableLabel"
  | "capacity"
  | "status"
  | "scanCount7d"
  | "scanCountLifetime"
  | "generatedAt"
  | "lastScannedAt";

type SortState = { key: SortKey; direction: "asc" | "desc" } | null;

/**
 * Status sorts by how much attention it wants, not alphabetically: a merchant
 * sorting this column is asking "what still needs doing", and "Not generated"
 * is the answer that belongs at the top.
 */
const QR_STATUS_RANK: Record<QrTableManagerRow["qrStatus"], number> = {
  not_generated: 0,
  revoked: 1,
  active: 2,
};

/**
 * Empty values sort last in **both** directions, which is why `direction` is
 * applied here rather than to this function's result: multiplying the verdict
 * outside would flip nulls to the top on a descending sort, and 200 "Never"
 * rows above the answer is exactly what the merchant did not ask for.
 */
function compareNullsLast<T>(
  a: T | null | undefined,
  b: T | null | undefined,
  direction: number,
  compare: (x: T, y: T) => number
) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction * compare(a, b);
}

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All statuses",
  active: "Active",
  revoked: "Revoked",
  not_generated: "Not generated",
};

const STATUS_LABELS: Record<QrTableManagerRow["qrStatus"], string> = {
  active: "Active",
  revoked: "Revoked",
  not_generated: "Not generated",
};

/**
 * One neutral pill for every state (DS-CTL-09). "Active" used to render
 * `bg-emerald-600`, which is the rule's canonical counter-example: status is
 * never colour-coded anywhere in the dashboard, because a screen where every
 * state carries its own hue becomes a colour key the merchant has to learn.
 * The word carries the meaning; finding all the codes of one status is the
 * status filter's job, not colour's.
 */
function getStatusBadge(status: QrTableManagerRow["qrStatus"]) {
  return (
    <Badge
      variant="secondary"
      className="w-fit rounded-full border-0 px-2.5 text-xs font-medium"
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/**
 * "3 weeks ago" rather than "8/17/2026, 9:10:44 PM".
 *
 * A generation timestamp to the second is noise on one row and a wall of
 * digits on 233 of them, and the column it sits in is scanned for recency, not
 * read for precision. The exact stamp stays available through the cell's
 * `title`, so nothing is actually lost.
 */
function formatRelative(value: string | null) {
  if (!value) return null;

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;

  const elapsed = Date.now() - then;
  if (Math.abs(elapsed) < 60 * 1000) return "Just now";

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(elapsed) >= ms) {
      return formatter.format(-Math.round(elapsed / ms), unit);
    }
  }
  return "Just now";
}

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
  fallbackLocationName,
  snapshot,
  isLoading,
  refresh,
}: QrTableManagerProps) {
  const locationName = snapshot?.locationName || fallbackLocationName;
  const storefrontEnabled = snapshot?.storefrontEnabled ?? false;
  const acceptsDineIn = snapshot?.acceptsDineIn ?? false;
  const qrKillSwitch = snapshot?.qrKillSwitch ?? false;
  // Closed until the snapshot says otherwise: a component that cannot see the
  // gate must not render an entitled UI. The banners below are held back until
  // the snapshot lands, so this default disables controls without telling a
  // perfectly entitled merchant they are locked out for the second it loads.
  const qrEntitled = snapshot?.billingGate.entitled ?? false;
  const qrGateMessage = snapshot?.billingGate.reason ?? null;
  const hasSnapshot = Boolean(snapshot);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // null = the server's own floor order (zone, then numeric table label).
  const [sort, setSort] = useState<SortState>(null);
  // One page cursor per zone, so paging through the bar does not move the patio.
  // Absent key means page 1; the map is cleared whenever the filters change.
  const [zonePages, setZonePages] = useState<Record<string, number>>({});
  // Selection is cleared whenever the filters change. Carrying it across a
  // filter would let a merchant revoke tables they can no longer see, and the
  // bulk bar's count would stop describing what is on screen.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allRows = useMemo(() => snapshot?.tables ?? [], [snapshot?.tables]);

  const totalTables = allRows.length;
  const generatedCount = snapshot?.generatedCount ?? 0;
  const activeCount = snapshot?.activeCount ?? 0;
  // The figure a merchant is actually here for, and the one that was never on
  // screen: the tables still waiting on a code.
  const missingCount = Math.max(0, totalTables - generatedCount);

  const isFiltered = search.trim() !== "" || statusFilter !== "all";

  // Match on the label a person actually reads off the floor plan, plus the
  // underlying name, so "12" finds table 12 whichever the merchant named it.
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (statusFilter !== "all" && row.qrStatus !== statusFilter) return false;
      if (!needle) return true;
      return (
        row.tableLabel.toLowerCase().includes(needle) ||
        row.tableName.toLowerCase().includes(needle) ||
        (row.zoneName ?? "").toLowerCase().includes(needle)
      );
    });
  }, [allRows, search, statusFilter]);

  /**
   * Sorting runs before grouping, so each zone lands already ordered.
   *
   * `sort === null` means the server's own order — zone, then numeric-aware
   * table label — which is what a merchant reading a floor plan expects. A
   * header click overrides it; clicking the active header a third time returns
   * to it, so there is always a way back to floor order.
   */
  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;

    const direction = sort.direction === "asc" ? 1 : -1;
    const rows = [...filteredRows];

    rows.sort((a, b) => {
      switch (sort.key) {
        case "tableLabel":
          return (
            direction *
            a.tableLabel.localeCompare(b.tableLabel, undefined, {
              numeric: true,
              sensitivity: "base",
            })
          );
        case "capacity":
          return compareNullsLast(
            a.capacity,
            b.capacity,
            direction,
            (x, y) => x - y
          );
        case "status":
          return (
            direction *
            (QR_STATUS_RANK[a.qrStatus] - QR_STATUS_RANK[b.qrStatus])
          );
        case "scanCount7d":
          return direction * (a.scanCount7d - b.scanCount7d);
        case "scanCountLifetime":
          return direction * (a.scanCountLifetime - b.scanCountLifetime);
        case "generatedAt":
          return compareNullsLast(
            a.generatedAt,
            b.generatedAt,
            direction,
            (x, y) => new Date(x).getTime() - new Date(y).getTime()
          );
        case "lastScannedAt":
          return compareNullsLast(
            a.lastScannedAt,
            b.lastScannedAt,
            direction,
            (x, y) => new Date(x).getTime() - new Date(y).getTime()
          );
        default:
          return 0;
      }
    });

    return rows;
  }, [filteredRows, sort]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, QrTableManagerRow[]>();
    for (const row of sortedRows) {
      const key = row.zoneName || "Unassigned";
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return Array.from(groups.entries());
  }, [sortedRows]);

  /**
   * asc → desc → off. Re-sorting invalidates every page cursor the same way a
   * filter change does: page 3 of one ordering is not page 3 of another.
   */
  function toggleSort(key: SortKey) {
    setZonePages({});
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }

  // A zone heading distinguishes one group from another. With every table in a
  // single zone there is nothing to distinguish, so the heading, its count and
  // its badge are pure chrome — 233 tables under one "Unassigned" title.
  const showZoneHeadings = groupedRows.length > 1;

  // Changing what is being looked at invalidates every cursor: page 7 of the
  // unfiltered list is not page 7 of the search results. Reset at the point of
  // change rather than in an effect watching it — the effect version renders
  // once on the stale page before correcting.
  function updateSearch(value: string) {
    setSearch(value);
    setZonePages({});
    setSelectedIds(new Set());
  }

  function updateStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    setZonePages({});
    setSelectedIds(new Set());
  }

  /**
   * The stat tiles double as the status filter (a tile already showing
   * "Generated 120" is the most direct way to ask for those 120). Clicking the
   * tile that is already applied clears it, so the control is a toggle rather
   * than a one-way trip.
   */
  function toggleStatusFilter(value: StatusFilter) {
    updateStatusFilter(statusFilter === value ? "all" : value);
  }

  const selectedRows = useMemo(
    () => filteredRows.filter((row) => selectedIds.has(row.floorPlanObjectId)),
    [filteredRows, selectedIds]
  );

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllSelected(rows: QrTableManagerRow[]) {
    const ids = rows.map((row) => row.floorPlanObjectId);
    const allOn = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function getZonePage(zoneName: string, totalRows: number) {
    const pageCount = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
    // Clamp rather than store: a zone can shrink under a filter while a stale
    // cursor still points past the end, which would render an empty zone.
    return Math.min(zonePages[zoneName] ?? 1, pageCount);
  }

  function setZonePage(zoneName: string, page: number) {
    setZonePages((prev) => ({ ...prev, [zoneName]: page }));
  }

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
            await refresh();
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
        await refresh();
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
      await refresh();
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
      await refresh();
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
    return {
      logoUrl: snapshot?.branding?.logoUrl ?? null,
      moduleColor: snapshot?.branding?.primaryColor ?? DEFAULT_MODULE_COLOR,
      backgroundColor:
        snapshot?.branding?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
      secondaryColor: snapshot?.branding?.secondaryColor ?? null,
    };
  }, [snapshot?.branding]);

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
    return snapshot?.storeName || locationName || "Store";
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

  /**
   * The artwork for one table's tent, rendered through the same pipeline as
   * the on-screen preview. Kept separate from the drawing below so a batch can
   * render each table's code and lay them all into one document.
   */
  async function renderTentAssets(row: QrTableManagerRow) {
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

    // Panel chrome follows the same colour the modules ended up with, so a
    // fallback to safe defaults degrades the whole sheet coherently rather
    // than leaving Dexa blue framing a black-and-white code.
    const chrome = parseHexColor(branding.moduleColor) ?? { r: 12, g: 79, b: 209 };

    return { qrUrl, qrImage, chrome, warnings };
  }

  function createTentDoc() {
    return new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "letter",
    });
  }

  /**
   * Draws one table's two-up tent onto the document's **current** page. The
   * caller owns paging, which is what lets a batch put 113 tables into one
   * PDF instead of 113 downloads.
   */
  function drawTentSheet(
    doc: jsPDF,
    row: QrTableManagerRow,
    qrUrl: string,
    qrImage: string,
    chrome: { r: number; g: number; b: number }
  ) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const panelWidth = pageWidth / 2;
    const brandTitle = getBrandTitle();
    const brandSubtitle = "Table ordering";
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

      // jsPDF defaults to no compression, so the 1400px code was embedded as
      // raw RGB: 1400 × 1400 × 3 = 5,880,000 bytes, measured on a generated
      // tent. A QR is large flat areas of two colours, which deflates to a
      // fraction of that. The alias keys jsPDF's image cache to this table's
      // code so the two panels below provably share one copy, rather than
      // leaving it to content hashing.
      doc.addImage(
        qrImage,
        "PNG",
        originX + panelWidth / 2 - 28,
        47,
        56,
        56,
        `qr-${row.floorPlanObjectId}`,
        "FAST"
      );

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
  }

  async function buildPdfBlob(row: QrTableManagerRow) {
    const { qrUrl, qrImage, chrome, warnings } = await renderTentAssets(row);
    reportBrandingWarnings(warnings);

    const doc = createTentDoc();
    drawTentSheet(doc, row, qrUrl, qrImage, chrome);
    return doc.output("blob");
  }

  /**
   * Every selected table's tent in one document, one table per sheet.
   *
   * Warnings are collected and de-duplicated across the whole run rather than
   * raised per table: a branding failure on a 113-table batch is one problem,
   * not 113 toasts. A table whose code is not ready is skipped and named in
   * the summary instead of aborting the run — a merchant printing a floor
   * should get the 112 sheets that are ready.
   */
  async function buildBatchPdfBlob(
    rows: QrTableManagerRow[],
    onProgress: (done: number) => void
  ) {
    const doc = createTentDoc();
    const warnings = new Set<string>();
    const skipped: string[] = [];
    let sheets = 0;

    for (const [index, row] of rows.entries()) {
      try {
        const assets = await renderTentAssets(row);
        for (const warning of assets.warnings) warnings.add(warning);

        if (sheets > 0) doc.addPage();
        drawTentSheet(doc, row, assets.qrUrl, assets.qrImage, assets.chrome);
        sheets += 1;
      } catch {
        skipped.push(row.tableLabel);
      }
      onProgress(index + 1);
    }

    reportBrandingWarnings([...warnings]);
    return { blob: sheets > 0 ? doc.output("blob") : null, sheets, skipped };
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

  async function handleDownloadSelectedPdf() {
    const rows = selectedRows.filter((row) => row.qrStatus !== "not_generated");
    if (rows.length === 0) {
      toast.error("None of the selected tables have a QR code to print yet.");
      return;
    }

    await withBusy("bulk-pdf", async () => {
      try {
        setBulkProgress({ done: 0, total: rows.length });
        const { blob, sheets, skipped } = await buildBatchPdfBlob(
          rows,
          (done) => setBulkProgress({ done, total: rows.length })
        );

        if (!blob) {
          toast.error("None of the selected tables could be rendered.");
          return;
        }

        const storeName = snapshot?.storeName || locationName || "store";
        downloadBlob(blob, `${slugifyFileName(storeName)}-table-tents.pdf`);
        toast.success(
          skipped.length > 0
            ? `Downloaded ${sheets} table tent${sheets === 1 ? "" : "s"}; skipped ${skipped.length} without a ready code.`
            : `Downloaded ${sheets} table tent${sheets === 1 ? "" : "s"} in one PDF`
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to export the PDF"
        );
      } finally {
        setBulkProgress(null);
      }
    });
  }

  /**
   * Reprint or revoke a selection, one request per table. The per-row actions
   * re-check the billing gate server-side, so a closed gate fails each call
   * rather than being trusted from the client.
   */
  async function handleBulkLifecycle(mode: "reprint" | "revoke") {
    const rows =
      mode === "revoke"
        ? selectedRows.filter((row) => row.qrStatus === "active")
        : selectedRows;

    if (rows.length === 0) {
      toast.error(
        mode === "revoke"
          ? "None of the selected tables have an active code to revoke."
          : "Select at least one table first."
      );
      return;
    }

    await withBusy(`bulk-${mode}`, async () => {
      let done = 0;
      let failed = 0;
      setBulkProgress({ done: 0, total: rows.length });

      for (const row of rows) {
        const result =
          mode === "revoke"
            ? await revokeTableQrCode(row.floorPlanObjectId)
            : await generateQrCodeForTable(row.floorPlanObjectId, {
                regenerate: false,
              });
        if (result.success) done += 1;
        else failed += 1;
        setBulkProgress({ done: done + failed, total: rows.length });
      }

      setBulkProgress(null);
      setSelectedIds(new Set());

      if (failed > 0) {
        toast.error(
          `${mode === "revoke" ? "Revoked" : "Reprinted"} ${done} of ${rows.length}; ${failed} failed.`
        );
      } else {
        showQrGeneratedToast(
          mode === "revoke"
            ? `Revoked ${done} QR code${done === 1 ? "" : "s"}`
            : `${done} QR code${done === 1 ? "" : "s"} ready to reprint`
        );
      }
      await refresh();
    });
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

  /**
   * Every per-table action behind one ghost icon (§5.2). Four outline buttons
   * used to sit on every row at equal weight — 932 of them on this location —
   * which made the row unreadable and, worse, hid a real hazard: Reprint and
   * Regenerate looked identical, but Regenerate mints a new token and
   * invalidates every code already printed for that table. Regenerate and
   * Revoke now carry `text-destructive`, which the no-colour rule explicitly
   * allows for an action's consequence (as opposed to a record's state).
   */
  /**
   * A sortable column heading — the ghost pill the design system prescribes
   * (§5.2), not bare text, so a header that responds to a click looks like it
   * will. The arrow is direction-bearing once active rather than the neutral
   * up/down glyph, because a merchant who just sorted needs to see which way.
   */
  function SortableHead({
    label,
    sortKey,
    align = "left",
    className,
  }: {
    label: string;
    sortKey: SortKey;
    align?: "left" | "right";
    className?: string;
  }) {
    const active = sort?.key === sortKey;
    const ariaSort = !active
      ? "none"
      : sort?.direction === "asc"
        ? "ascending"
        : "descending";

    const alignRight = align === "right";

    // The arrow leads on a right-aligned column so the *label* ends where the
    // figures end. With the arrow trailing, the label stopped ~20px short of
    // its own column of numbers and the heading read as belonging to the
    // column on its left.
    const icon = (
      <span className={cn("shrink-0", alignRight ? "mr-2" : "ml-2")}>
        {active ? (
          sort?.direction === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </span>
    );

    return (
      <TableHead
        aria-sort={ariaSort}
        className={cn(alignRight && "text-right", className)}
      >
        {/* One-sided negative margin cancels the button's own padding on the
            side that has to line up, so the label's edge sits exactly on the
            cell's text edge — the same edge the values below are aligned to. */}
        <Button
          variant="ghost"
          onClick={() => toggleSort(sortKey)}
          className={cn(
            "h-8 rounded-full px-2 font-medium",
            alignRight ? "-mr-2" : "-ml-2",
            active ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {alignRight ? (
            <>
              {icon}
              {label}
            </>
          ) : (
            <>
              {label}
              {icon}
            </>
          )}
        </Button>
      </TableHead>
    );
  }

  function renderRowActions(row: QrTableManagerRow) {
    const isBusy =
      busyKey === `gen-${row.floorPlanObjectId}` ||
      busyKey === `regen-${row.floorPlanObjectId}` ||
      busyKey === `revoke-${row.floorPlanObjectId}`;
    const hasCode = row.qrStatus !== "not_generated";
    const canExport = hasCode && Boolean(row.tableToken);

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 w-8 shrink-0 rounded-full p-0"
            disabled={busyKey !== null}
            aria-label={`Actions for ${row.tableLabel}`}
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Muted group labels rather than separators — horizontal rules are
              banned outright (§5.5), and a label says more than a line. */}
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Code
          </DropdownMenuLabel>
          {hasCode ? (
            <>
              <DropdownMenuItem
                onClick={() => void handleGenerate(row, false)}
                disabled={!qrEntitled}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reprint
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => void handleGenerate(row, true)}
                disabled={!qrEntitled}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Regenerate
              </DropdownMenuItem>
              {row.qrStatus === "active" ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => void handleRevoke(row)}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Revoke
                </DropdownMenuItem>
              ) : null}
            </>
          ) : (
            <DropdownMenuItem
              onClick={() => void handleGenerate(row, false)}
              disabled={!qrEntitled}
            >
              <QrCode className="mr-2 h-4 w-4" />
              Generate
            </DropdownMenuItem>
          )}

          {canExport ? (
            <>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Guest link
              </DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!storefrontEnabled}
                onClick={() => handlePreview(row)}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Preview guest view
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleCopyLink(row)}>
                <Copy className="mr-2 h-4 w-4" />
                Copy guest link
              </DropdownMenuItem>

              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Download
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => void handleDownloadSvg(row)}>
                <FileImage className="mr-2 h-4 w-4" />
                SVG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleDownloadPng(row)}>
                <FileImage className="mr-2 h-4 w-4" />
                PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleDownloadPdf(row)}>
                <FileText className="mr-2 h-4 w-4" />
                PDF table tent
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handlePrintPdf(row)}>
                <Printer className="mr-2 h-4 w-4" />
                Print table tent
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
    <Panel>
      <PanelSection
        icon={QrCode}
        label="QR code manager"
        caption={
          locationName
            ? `Generate, preview, export, regenerate, and revoke table QR codes for ${locationName}.`
            : "Generate, preview, export, regenerate, and revoke table QR codes for this location."
        }
        action={
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
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

        {/* The figures double as the status filter. A merchant looking for the
            tables still missing a code was previously reading a number that was
            not on screen at all (it is total minus generated) and then finding
            it in a select; the tile that states the count now applies it.
            "Missing" replaces "Generated" as the third figure because it is the
            actionable one — generated is still shown, as the meta under Tables. */}
        <StatRow columns={3}>
          <StatTile
            label="Tables"
            value={totalTables}
            meta={`${generatedCount} generated`}
            onClick={() => toggleStatusFilter("all")}
            isActive={statusFilter === "all"}
          />
          <StatTile
            label="Active"
            value={activeCount}
            meta="Scannable by guests"
            onClick={() => toggleStatusFilter("active")}
            isActive={statusFilter === "active"}
          />
          <StatTile
            label="Missing"
            value={missingCount}
            meta="No code generated yet"
            onClick={() => toggleStatusFilter("not_generated")}
            isActive={statusFilter === "not_generated"}
          />
        </StatRow>

        <div className="flex flex-col gap-4 rounded-2xl border bg-muted/40 p-4 sm:flex-row sm:items-center">
          <BrandedQrPreview value={previewQrUrl} branding={qrBranding} />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">
              {hasMerchantLogo
                ? "Your logo and brand colours"
                : "Your brand colours"}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasMerchantLogo
                ? "Every download and printed table tent uses this exact artwork."
                : "Add a logo in Online Store settings to place it at the centre of every code."}
            </p>
            {hasMerchantLogo ? (
              <p className="text-xs text-muted-foreground">
                Scan this preview with your phone before printing a full run.
              </p>
            ) : null}
          </div>
        </div>

        {/* These switches live on Online Ordering, not on this screen — this
            screen prints codes, it does not set policy. Each banner links to
            the switch it is complaining about so the fix is one click away. */}
        {hasSnapshot && !acceptsDineIn ? (
          <div className="rounded-2xl border-0 bg-muted px-4 py-3 text-sm text-foreground shadow-none">
            QR scan handling is currently disabled for this store. You can still prepare codes here, but guests will not be allowed to order from scans until <span className="font-medium">Enable QR table ordering</span> is turned on in{" "}
            <Link href="/dashboard/online-ordering" className="font-medium underline underline-offset-4">
              Online Ordering
            </Link>
            .
          </div>
        ) : null}

        {hasSnapshot && !storefrontEnabled ? (
          <div className="rounded-2xl border-0 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-none dark:bg-amber-900/20 dark:text-amber-200">
            The main online store is currently disabled. QR preview and real guest scans will fail closed until the store is switched on in{" "}
            <Link href="/dashboard/online-ordering" className="font-medium underline underline-offset-4">
              Online Ordering
            </Link>
            .
          </div>
        ) : null}

        {hasSnapshot && !qrEntitled ? (
          <div className="rounded-2xl border-0 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-none dark:bg-amber-900/20 dark:text-amber-200">
            {qrGateMessage ||
              "QR Table Ordering is not available for the current subscription tier."}
          </div>
        ) : null}

        {hasSnapshot && qrKillSwitch ? (
          <div className="rounded-2xl border-0 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-none">
            QR kill switch is active. Existing codes remain visible here, but new guest scans should fail closed until the switch is turned off.
          </div>
        ) : null}
        </div>
      </PanelSection>
    </Panel>

    {/* The table is deliberately outside the panel above (§5.2): the data
        table's own `rounded-2xl bg-muted/20` container is a surface in its own
        right, and nesting it inside a tier-1 panel draws a box inside a box. */}
    <div className="space-y-4">
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

        {!isLoading && allRows.length > 0 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder="Search tables by name or zone"
                aria-label="Search tables"
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => updateStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger className="sm:w-48" aria-label="Filter by QR status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(STATUS_FILTER_LABELS) as StatusFilter[]
                ).map((value) => (
                  <SelectItem key={value} value={value}>
                    {STATUS_FILTER_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
              {isFiltered
                ? `${filteredRows.length} of ${allRows.length} tables`
                : `${allRows.length} table${allRows.length === 1 ? "" : "s"}`}
            </p>
          </div>
        ) : null}

        {!isLoading && allRows.length > 0 && filteredRows.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl border-0 bg-muted/60 px-4 py-8 text-sm text-muted-foreground shadow-none">
            <p>
              No tables match{" "}
              {search.trim() ? (
                <>
                  &ldquo;<span className="font-medium text-foreground">{search.trim()}</span>&rdquo;
                </>
              ) : (
                "this filter"
              )}
              {statusFilter !== "all" && search.trim()
                ? ` with status ${STATUS_FILTER_LABELS[statusFilter].toLowerCase()}`
                : ""}
              .
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                updateSearch("");
                updateStatusFilter("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : null}

        {!isLoading && filteredRows.length > 0 ? (
          <>
            {/* Bulk bar (§5.2): ghost pills on a tinted well, count in
                tabular-nums. At 233 tables the real jobs are "print the ones
                that are missing" and "revoke that zone" — both were previously
                one dropdown per table. */}
            {selectedRows.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border-0 bg-muted/60 px-3 py-3 shadow-none">
                <span className="px-1 text-sm font-medium tabular-nums">
                  {selectedRows.length} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3"
                  onClick={() => void handleDownloadSelectedPdf()}
                  disabled={busyKey !== null}
                >
                  {busyKey === "bulk-pdf" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  {busyKey === "bulk-pdf" && bulkProgress
                    ? `Rendering ${bulkProgress.done} of ${bulkProgress.total}`
                    : "Download tents as one PDF"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3"
                  onClick={() => void handleBulkLifecycle("reprint")}
                  disabled={busyKey !== null || !qrEntitled}
                >
                  {busyKey === "bulk-reprint" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {busyKey === "bulk-reprint" && bulkProgress
                    ? `Reprinting ${bulkProgress.done} of ${bulkProgress.total}`
                    : "Reprint"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3 text-destructive hover:text-destructive"
                  onClick={() => void handleBulkLifecycle("revoke")}
                  disabled={busyKey !== null}
                >
                  {busyKey === "bulk-revoke" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Ban className="mr-2 h-4 w-4" />
                  )}
                  Revoke
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-8 rounded-full px-3 text-muted-foreground"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={busyKey !== null}
                >
                  Clear
                </Button>
              </div>
            ) : null}

            {groupedRows.map(([zoneName, rows]) => {
              const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
              const page = getZonePage(zoneName, rows.length);
              const firstIndex = (page - 1) * ROWS_PER_PAGE;
              const pageRows = rows.slice(firstIndex, firstIndex + ROWS_PER_PAGE);
              const allOnPageSelected =
                pageRows.length > 0 &&
                pageRows.every((row) => selectedIds.has(row.floorPlanObjectId));

              return (
                <div key={zoneName} className="min-w-0 space-y-3">
                  {/* A single zone gets no heading. 233 tables in "Unassigned"
                      was carrying a title, a count and a badge that partitioned
                      nothing — the heading only earns its place when there is a
                      second zone to tell it apart from. */}
                  {showZoneHeadings ? (
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{zoneName}</h3>
                        <p className="text-sm text-muted-foreground tabular-nums">
                          {rows.length} table{rows.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="w-fit shrink-0 rounded-full border-0 px-2.5 text-xs font-medium tabular-nums"
                      >
                        {rows.filter((row) => row.qrStatus === "active").length} active
                      </Badge>
                    </div>
                  ) : null}

                  <Table
                    variant="data"
                    containerClassName="hidden xl:block"
                    className="min-w-[980px]"
                  >
                    <TableHeader className="[&_tr]:border-0">
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allOnPageSelected}
                            onCheckedChange={() => toggleAllSelected(pageRows)}
                            aria-label={`Select every table shown in ${zoneName}`}
                          />
                        </TableHead>
                        {/* Read left to right as three groups: which table,
                            what state its code is in, how it is being used.
                            Generated used to sit between the scan counts and
                            Last scan, splitting the usage group in half with a
                            lifecycle field. Seats is its own column so the
                            figures line up and can be read down — inside the
                            Table cell it neither aligned nor made sense on a
                            table actually named "2-Person Booth". */}
                        <SortableHead label="Table" sortKey="tableLabel" />
                        <SortableHead
                          label="Seats"
                          sortKey="capacity"
                          align="right"
                          className="w-24"
                        />
                        <SortableHead
                          label="Status"
                          sortKey="status"
                          className="w-40"
                        />
                        <SortableHead
                          label="Generated"
                          sortKey="generatedAt"
                          className="w-40"
                        />
                        {/* Two labelled columns rather than one "Scans" cell
                            reading "0 / 0", which gave the reader no way to
                            know which number was which. */}
                        <SortableHead
                          label="Scans (7d)"
                          sortKey="scanCount7d"
                          align="right"
                          className="w-28"
                        />
                        <SortableHead
                          label="Scans (all)"
                          sortKey="scanCountLifetime"
                          align="right"
                          className="w-28"
                        />
                        <SortableHead
                          label="Last scan"
                          sortKey="lastScannedAt"
                          className="w-40"
                        />
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((row) => (
                        <TableRow key={row.floorPlanObjectId}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(row.floorPlanObjectId)}
                              onCheckedChange={() =>
                                toggleRowSelected(row.floorPlanObjectId)
                              }
                              aria-label={`Select ${row.tableLabel}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.tableLabel}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.capacity ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(row.qrStatus)}</TableCell>
                          <TableCell
                            className="whitespace-nowrap"
                            title={formatDateTime(row.generatedAt)}
                          >
                            {formatRelative(row.generatedAt) ?? (
                              <span className="text-muted-foreground">Never</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.scanCount7d}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.scanCountLifetime}
                          </TableCell>
                          <TableCell
                            className="whitespace-nowrap"
                            title={formatDateTime(row.lastScannedAt)}
                          >
                            {formatRelative(row.lastScannedAt) ?? (
                              <span className="text-muted-foreground">Never</span>
                            )}
                          </TableCell>
                          <TableCell>{renderRowActions(row)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Below xl this is a card grid, never a sideways-scrolling
                      table (§5.3). */}
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                    {pageRows.map((row) => {
                      const isSelected = selectedIds.has(row.floorPlanObjectId);
                      return (
                        <div
                          key={row.floorPlanObjectId}
                          className={cn(
                            "min-w-0 rounded-2xl border-0 p-4",
                            isSelected ? "bg-muted ring-1 ring-border" : "bg-muted/45"
                          )}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <Checkbox
                                className="mt-1"
                                checked={isSelected}
                                onCheckedChange={() =>
                                  toggleRowSelected(row.floorPlanObjectId)
                                }
                                aria-label={`Select ${row.tableLabel}`}
                              />
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {row.tableLabel}
                                </p>
                                <div className="mt-1.5">
                                  {getStatusBadge(row.qrStatus)}
                                </div>
                              </div>
                            </div>
                            {renderRowActions(row)}
                          </div>

                          <div className="mt-4 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            {/* Same order as the desktop columns, so the two
                                layouts teach the same reading. */}
                            <div className="min-w-0">
                              <p className="text-muted-foreground">Seats</p>
                              <p className="mt-0.5 tabular-nums">
                                {row.capacity ?? "—"}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-muted-foreground">Generated</p>
                              <p
                                className="mt-0.5 truncate"
                                title={formatDateTime(row.generatedAt)}
                              >
                                {formatRelative(row.generatedAt) ?? "Never"}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-muted-foreground">Scans (7d)</p>
                              <p className="mt-0.5 tabular-nums">{row.scanCount7d}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-muted-foreground">Scans (all)</p>
                              <p className="mt-0.5 tabular-nums">
                                {row.scanCountLifetime}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-muted-foreground">Last scan</p>
                              <p
                                className="mt-0.5 truncate"
                                title={formatDateTime(row.lastScannedAt)}
                              >
                                {formatRelative(row.lastScannedAt) ?? "Never"}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Only zones large enough to page get a pager: a six-table
                      patio should not carry the chrome of a 233-table floor. */}
                  {pageCount > 1 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground tabular-nums sm:text-sm">
                        Showing {firstIndex + 1}–{firstIndex + pageRows.length} of{" "}
                        {rows.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                          onClick={() => setZonePage(zoneName, page - 1)}
                          disabled={page <= 1}
                          aria-label={`Previous page of ${zoneName}`}
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          Page {page} of {pageCount}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                          onClick={() => setZonePage(zoneName, page + 1)}
                          disabled={page >= pageCount}
                          aria-label={`Next page of ${zoneName}`}
                        >
                          Next
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </>
        ) : null}
    </div>
    </>
  );
}
