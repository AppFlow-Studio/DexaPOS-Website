"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  FileText,
  RefreshCcwDot,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PageShell,
  PageHeader,
  Panel,
  PanelSection,
  StatRow,
  StatTile,
} from "@/components/dashboard/shell";
import { DateRangePicker } from "@/components/dashboard/orders/DateRangePicker";
import { cn } from "@/lib/utils";
import {
  DEADLINE_URGENCY_STYLES,
  UNKNOWN_SOURCE_STYLE,
  getDisputeStatusLabel,
  getDisputeStatusStyle,
} from "@/lib/constants/dispute-status";
import { useChargebacks } from "../../hooks/useChargebacks";
import { useClerkOrgId } from "../../hooks/usePayments";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { MerchantChargebackFilters, MerchantChargebackRow, SubmitChargebackDefense, UploadDisputeDocument } from "../../actions/chargebacks";
import { useAuth } from "@clerk/nextjs";

const PAGE_SIZE = 25;
const OPEN_STATUSES = new Set(["notified", "under_review"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return format(new Date(value), "MMM d, yyyy h:mm a");
}

function formatDate(value?: string) {
  if (!value) return "-";
  return format(new Date(value), "MMM d, yyyy");
}

function getStatusBadge(status: string) {
  const style = getDisputeStatusStyle(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        style.bg,
        style.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
      {getDisputeStatusLabel(status)}
    </span>
  );
}

function getDeadlineDisplay(deadline?: string, status?: string) {
  if (!deadline) return <span className="text-muted-foreground">-</span>;

  const deadlineMs = new Date(deadline).getTime();
  const nowMs = Date.now();
  const diffMs = deadlineMs - nowMs;
  const isOpen = status ? OPEN_STATUSES.has(status.toLowerCase()) : true;
  const dateLabel = formatDate(deadline);

  if (!isOpen) return <span className="text-xs text-muted-foreground">{dateLabel}</span>;
  if (diffMs <= 0) {
    const overdueStyle = DEADLINE_URGENCY_STYLES.overdue;
    return (
      <span
        className={cn(
          "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
          overdueStyle.bg,
          overdueStyle.text
        )}
      >
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", overdueStyle.dot)} />
        Overdue
      </span>
    );
  }

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (diffMs <= sevenDaysMs) {
    const daysLeft = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    const urgentStyle = DEADLINE_URGENCY_STYLES.urgent;
    return (
      <div className="flex flex-col gap-0.5">
        <span
          className={cn(
            "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
            urgentStyle.bg,
            urgentStyle.text
          )}
        >
          <AlertTriangle className="h-3 w-3" />
          {daysLeft}d left
        </span>
        <span className="text-xs text-muted-foreground">{dateLabel}</span>
      </div>
    );
  }

  return <span className="text-xs">{dateLabel}</span>;
}

// ─── Document upload ──────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Expandable row detail ────────────────────────────────────────────────────

function ChargebackDetail({
  row,
  clerkOrgId,
  merchantId,
  onRefresh,
}: {
  row: MerchantChargebackRow;
  clerkOrgId: string;
  merchantId: string;
  onRefresh: () => void;
}) {
  const { getToken } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Only PDF, JPEG, PNG, or WEBP files are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10 MB.");
      return;
    }

    setIsUploading(true);
    try {
      const token = await getToken({ template: "supabase" });
      if (!token) throw new Error("Not authenticated");

      const fileBase64 = await fileToBase64(file);
      const fileName = `dispute_${row.id}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      const cdnRes = await fetch(`${supabaseUrl}/functions/v1/cdn-upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scope: "merchant",
          merchantId,
          category: "documents",
          fileName,
          fileBase64,
          contentType: file.type,
        }),
      });

      const cdnData = await cdnRes.json();
      if (!cdnData.success) throw new Error(cdnData.error ?? "Upload failed");

      const result = await UploadDisputeDocument(clerkOrgId, row.id, {
        name: file.name,
        url: cdnData.cdnUrl,
        uploaded_at: new Date().toISOString(),
      });

      if (!result.success) throw new Error(result.error);

      toast.success("Document uploaded successfully.");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSubmitDefense = () => {
    startSubmitTransition(async () => {
      const result = await SubmitChargebackDefense(clerkOrgId, row.id);
      if (result.success) {
        toast.success("Defense submitted successfully.");
        onRefresh();
      } else {
        toast.error(result.error ?? "Failed to submit defense.");
      }
    });
  };

  const alreadyDefended = !!row.defense_submitted_at;
  const p = row.original_payment;

  return (
    <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-3">
      {/* Source transaction */}
      <Panel nested className="min-w-0 space-y-2 p-3">
        <h4 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">Source Transaction</h4>
        {p ? (
          <div className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Order #:</span>{" "}
              {p.order_number ? (
                <Link href={`/dashboard/orders?search=${p.order_number}`} className="inline-flex items-center gap-1 text-[#0C4FD1] hover:underline dark:text-[#6CA0FF]">
                  {p.order_number}<ExternalLink className="h-3 w-3" />
                </Link>
              ) : "-"}
            </div>
            <div><span className="text-muted-foreground">Customer:</span> {p.customer_name ?? "Walk-in"}</div>
            <div><span className="text-muted-foreground">Method:</span> {p.payment_method ?? "-"}</div>
            <div><span className="text-muted-foreground">Status:</span> {p.payment_status ?? "-"}</div>
            <div><span className="text-muted-foreground">Amount:</span> <span className="tabular-nums">{formatCurrency(p.total_amount)}</span></div>
            <div><span className="text-muted-foreground">Card:</span> <span className="font-mono tabular-nums">{p.card_last_four ? `****${p.card_last_four}` : "-"}</span></div>
            <div><span className="text-muted-foreground">Auth Code:</span> <span className="font-mono text-xs tabular-nums">{p.authorization_code ?? "-"}</span></div>
            <div><span className="text-muted-foreground">Date:</span> {formatDateTime(p.captured_at ?? p.initiated_at)}</div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Source transaction not linked.</p>
        )}
      </Panel>

      {/* Reason */}
      <Panel nested className="min-w-0 space-y-2 p-3">
        <h4 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">Dispute Reason</h4>
        <div className="space-y-1 text-sm">
          <div><span className="text-muted-foreground">Code:</span> <span className="font-mono text-xs">{row.reason_code}</span></div>
          <div className="min-w-0">
            <span className="text-muted-foreground">Description:</span>
            <span className="ml-1 block whitespace-normal break-words">
              {row.reason_description ?? "-"}
            </span>
          </div>
          <div><span className="text-muted-foreground">Network:</span> {row.card_network ? row.card_network.toUpperCase() : "-"}</div>
          <div className="min-w-0 break-words"><span className="text-muted-foreground">PSP Reference:</span> <span className="font-mono text-xs">{row.dispute_psp_reference ?? "-"}</span></div>
          <div><span className="text-muted-foreground">Received:</span> {formatDateTime(row.received_at)}</div>
          {row.resolved_at && (
            <div><span className="text-muted-foreground">Resolved:</span> {formatDateTime(row.resolved_at)}</div>
          )}
          {row.resolution && (
            <div><span className="text-muted-foreground">Resolution:</span> {row.resolution}</div>
          )}
        </div>
      </Panel>

      {/* Defense */}
      <Panel nested className="min-w-0 space-y-2 p-3">
        <h4 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">Defense</h4>

        {row.defense_documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {row.defense_documents.map((doc, i) => (
              <div key={i} className="flex items-start gap-2 rounded-2xl bg-muted/60 p-2 text-sm">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{doc.name}</div>
                  {doc.url && (
                    <a href={doc.url} target="_blank" rel="noreferrer"
                      className="text-xs text-[#0C4FD1] hover:underline dark:text-[#6CA0FF]">
                      View document
                    </a>
                  )}
                  {doc.uploaded_at && (
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(doc.uploaded_at)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          {!alreadyDefended && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                disabled={isUploading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? "Uploading…" : "Upload Document"}
              </Button>

              <Button
                size="sm"
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                disabled={isSubmitting || row.defense_documents.length === 0}
                onClick={handleSubmitDefense}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                {isSubmitting ? "Submitting…" : "Submit Defense"}
              </Button>
            </>
          )}

          {alreadyDefended && (
            <div className="flex items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
              Defense submitted {formatDateTime(row.defense_submitted_at)}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["notified", "under_review", "defended", "won", "lost", "expired"] as const;

export default function DisputesPage() {
  const clerkOrgId = useClerkOrgId();
  const { data: userInfo } = useUserInfo();
  const merchantId: string = (userInfo as { members?: { organizations?: { merchants?: { id?: string } } }[] } | null)
    ?.members?.[0]?.organizations?.merchants?.id ?? "";

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // DateRangePicker works in `Date`, but the filter shape (`MerchantChargebackFilters`)
  // is ISO date strings — convert at this boundary only, business logic unchanged.
  const pickerDateFrom = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
  const pickerDateTo = dateTo ? new Date(`${dateTo}T00:00:00`) : null;
  const handlePickerRangeChange = (from: Date | null, to: Date | null) => {
    setDateFrom(from ? from.toISOString().slice(0, 10) : "");
    setDateTo(to ? to.toISOString().slice(0, 10) : "");
    setPage(1);
  };

  const filters = useMemo<Omit<MerchantChargebackFilters, "locationId">>(() => ({
    statuses: statusFilter !== "all" ? [statusFilter] : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [statusFilter, dateFrom, dateTo]);

  const { data: result, isLoading, isFetching, refetch } = useChargebacks(filters, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const { data: underReviewData } = useChargebacks({ statuses: ["under_review"] }, 1, 0);

  const rows = result?.data ?? [];
  const total = result?.total ?? 0;
  const pendingCount = result?.pendingCount ?? 0;
  const urgentCount = result?.urgentCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showTo = total === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + rows.length, total);

  const resolvedCount = rows.filter((r) => r.status === "won" || r.status === "resolved").length;

  const clearFilters = () => {
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    setExpandedId(null);
  };

  const handleRefresh = () => { void refetch(); };

  return (
    <PageShell>
      <PageHeader
        title="TSYS Disputes"
        subtitle="Monitor and respond to payment disputes"
        actions={
          <Button variant="outline" onClick={handleRefresh} disabled={isFetching} className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm">
            <RefreshCcwDot className="mr-2 h-4 w-4" />
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {/* Summary cards */}
      <Panel>
        <div className="px-6 py-6">
          <StatRow columns={4}>
            <StatTile
              label="Open Disputes"
              value={isLoading ? undefined : pendingCount.toLocaleString()}
              meta="Notified or under review"
              icon={<ShieldAlert className="text-muted-foreground" />}
              isLoading={isLoading}
            />
            <StatTile
              label="Urgent"
              value={isLoading ? undefined : urgentCount.toLocaleString()}
              meta="Deadline within 7 days"
              icon={<AlertTriangle className="text-muted-foreground" />}
              isLoading={isLoading}
            />
            <StatTile
              label="Under Review"
              value={isLoading ? undefined : (underReviewData?.total ?? 0).toLocaleString()}
              meta="Currently being reviewed"
              icon={<Clock className="text-muted-foreground" />}
              isLoading={isLoading}
            />
            <StatTile
              label="Won / Resolved"
              value={isLoading ? undefined : resolvedCount.toLocaleString()}
              meta="In current page view"
              icon={<ShieldCheck className="text-muted-foreground" />}
              isLoading={isLoading}
            />
          </StatRow>
        </div>
      </Panel>

      {/* Table panel */}
      <Panel>
        <PanelSection
          label="All Disputes"
          caption="Click any row to view details, upload defense documents, or submit a defense response."
        >
          {/* Filters */}
          <div className="mb-6 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Status</span>
              <Select
                value={statusFilter}
                onValueChange={(value) => { setStatusFilter(value); setPage(1); }}
              >
                <SelectTrigger className="h-9 text-[0.8125rem]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <DateRangePicker
              dateFrom={pickerDateFrom}
              dateTo={pickerDateTo}
              onDateRangeChange={handlePickerRangeChange}
              initializeWhenEmpty={false}
              triggerClassName="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            />

            {(statusFilter !== "all" || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 self-end rounded-full px-3 text-muted-foreground hover:text-foreground"
                onClick={clearFilters}
              >
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Empty
              icon={ShieldAlert}
              title="No disputes found"
              description="No payment disputes match the current filters."
            />
          ) : (
            <>
              {/* §5: variant="data" carries the tinted well, header band and
                  borderless rows — do not restate them at the call site.
                  §5.3: below xl this gives way to the card grid further down. */}
              <Table
                variant="data"
                containerClassName="hidden xl:block"
                className="min-w-[900px]"
              >
                <TableHeader className="[&_tr]:border-0">
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Status</TableHead>
                    <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Received</TableHead>
                    <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Card</TableHead>
                    <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">Amount</TableHead>
                    <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Reason</TableHead>
                    <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Deadline</TableHead>
                    <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">Order</TableHead>
                    <TableHead className="h-auto w-8 py-2.5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isExpanded = expandedId === row.id;
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className={cn(
                            "cursor-pointer border-0 transition-colors",
                            isExpanded && "bg-muted/40"
                          )}
                          onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                        >
                          <TableCell className="py-3 text-sm">{getStatusBadge(row.status)}</TableCell>
                          <TableCell className="whitespace-nowrap py-3 text-sm text-muted-foreground">
                            {formatDate(row.received_at)}
                          </TableCell>
                          <TableCell className="py-3 font-mono text-sm tabular-nums">
                            {row.original_payment?.card_last_four
                              ? `****${row.original_payment.card_last_four}`
                              : "-"}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono text-sm font-semibold tabular-nums">
                            {formatCurrency(row.amount)}
                          </TableCell>
                          <TableCell className="py-3 text-sm">
                            <div className="font-mono text-xs">{row.reason_code}</div>
                            {row.reason_description && (
                              <div className="text-xs text-muted-foreground break-words whitespace-normal">
                                {row.reason_description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-3 text-sm">{getDeadlineDisplay(row.defense_deadline, row.status)}</TableCell>
                          <TableCell className="py-3 text-sm">
                            {row.original_payment?.order_number ? (
                              <Link
                                href={`/dashboard/orders?search=${row.original_payment.order_number}`}
                                className="inline-flex items-center gap-1 text-sm text-[#0C4FD1] hover:underline dark:text-[#6CA0FF]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {row.original_payment.order_number}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : !row.original_payment ? (
                              <span
                                className={cn(
                                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                                  UNKNOWN_SOURCE_STYLE.bg,
                                  UNKNOWN_SOURCE_STYLE.text
                                )}
                              >
                                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", UNKNOWN_SOURCE_STYLE.dot)} />
                                Source unknown
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 text-sm">
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            }
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow className="border-0 hover:bg-transparent">
                            <TableCell colSpan={8} className="bg-muted/40 p-0">
                              <ChargebackDetail
                                row={row}
                                clerkOrgId={clerkOrgId}
                                merchantId={merchantId}
                                onRefresh={() => { void refetch(); }}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>

              {/* §5.3: card grid below xl — never a horizontally scrolling
                  table on mobile. Same rows, same expand behaviour. */}
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                {rows.map((row) => {
                  const isExpanded = expandedId === row.id;
                  return (
                    <article
                      key={row.id}
                      className={cn(
                        "min-w-0 rounded-2xl border-0 p-4 transition-colors",
                        isExpanded ? "bg-muted ring-1 ring-border" : "bg-muted/45"
                      )}
                    >
                      <button
                        type="button"
                        className="w-full min-w-0 text-left"
                        onClick={() =>
                          setExpandedId((cur) => (cur === row.id ? null : row.id))
                        }
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="min-w-0 flex-1">
                            {getStatusBadge(row.status)}
                          </div>
                          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                            {formatCurrency(row.amount)}
                          </span>
                        </div>

                        <dl className="mt-4 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3">
                          <div className="min-w-0">
                            <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                              Received
                            </dt>
                            <dd className="mt-1 truncate text-sm">
                              {formatDate(row.received_at)}
                            </dd>
                          </div>
                          <div className="min-w-0 text-right">
                            <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                              Card
                            </dt>
                            <dd className="mt-1 truncate font-mono text-sm tabular-nums">
                              {row.original_payment?.card_last_four
                                ? `****${row.original_payment.card_last_four}`
                                : "-"}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                              Reason
                            </dt>
                            <dd className="mt-1 truncate font-mono text-xs">
                              {row.reason_code}
                            </dd>
                          </div>
                          <div className="min-w-0 text-right">
                            <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                              Deadline
                            </dt>
                            <dd className="mt-1 flex justify-end">
                              {getDeadlineDisplay(row.defense_deadline, row.status)}
                            </dd>
                          </div>
                        </dl>
                      </button>

                      {isExpanded && (
                        <div className="-mx-4 -mb-4 mt-4">
                          <ChargebackDetail
                            row={row}
                            clerkOrgId={clerkOrgId}
                            merchantId={merchantId}
                            onRefresh={() => { void refetch(); }}
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              {/* Pagination */}
              <div className="flex flex-col gap-2 pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span className="tabular-nums">Showing {showFrom}–{showTo} of {total.toLocaleString()}</span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                    >
                      Previous
                    </Button>
                    <span className="tabular-nums">Page {page} of {totalPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </PanelSection>
      </Panel>
    </PageShell>
  );
}
