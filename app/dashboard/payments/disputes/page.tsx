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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const s = status.toLowerCase();
  if (s === "notified")
    return <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800">Notified</Badge>;
  if (s === "under_review")
    return <Badge variant="outline" className="border-blue-300 bg-blue-100 text-blue-800">Under Review</Badge>;
  if (s === "defended")
    return <Badge variant="outline" className="border-purple-300 bg-purple-100 text-purple-800">Defended</Badge>;
  if (s === "won")
    return <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800">Won</Badge>;
  if (s === "lost")
    return <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800">Lost</Badge>;
  if (s === "expired")
    return <Badge variant="outline" className="border-gray-300 bg-gray-100 text-gray-700">Expired</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function getDeadlineDisplay(deadline?: string, status?: string) {
  if (!deadline) return <span className="text-muted-foreground">-</span>;

  const deadlineMs = new Date(deadline).getTime();
  const nowMs = Date.now();
  const diffMs = deadlineMs - nowMs;
  const isOpen = status ? OPEN_STATUSES.has(status.toLowerCase()) : true;
  const dateLabel = formatDate(deadline);

  if (!isOpen) return <span className="text-xs text-muted-foreground">{dateLabel}</span>;
  if (diffMs <= 0)
    return <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800">Overdue</Badge>;

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (diffMs <= sevenDaysMs) {
    const daysLeft = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="outline" className="w-fit border-red-300 bg-red-100 text-red-800">
          <AlertTriangle className="mr-1 h-3 w-3" />
          {daysLeft}d left
        </Badge>
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
    <div className="grid gap-4 p-4 lg:grid-cols-3">
      {/* Source transaction */}
      <div className="space-y-2 rounded-md border p-3">
        <h4 className="text-sm font-semibold">Source Transaction</h4>
        {p ? (
          <div className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Order #:</span>{" "}
              {p.order_number ? (
                <Link href={`/dashboard/orders?search=${p.order_number}`} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                  {p.order_number}<ExternalLink className="h-3 w-3" />
                </Link>
              ) : "-"}
            </div>
            <div><span className="text-muted-foreground">Customer:</span> {p.customer_name ?? "Walk-in"}</div>
            <div><span className="text-muted-foreground">Method:</span> {p.payment_method ?? "-"}</div>
            <div><span className="text-muted-foreground">Status:</span> {p.payment_status ?? "-"}</div>
            <div><span className="text-muted-foreground">Amount:</span> {formatCurrency(p.total_amount)}</div>
            <div><span className="text-muted-foreground">Card:</span> {p.card_last_four ? `****${p.card_last_four}` : "-"}</div>
            <div><span className="text-muted-foreground">Auth Code:</span> <span className="font-mono text-xs">{p.authorization_code ?? "-"}</span></div>
            <div><span className="text-muted-foreground">Date:</span> {formatDateTime(p.captured_at ?? p.initiated_at)}</div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Source transaction not linked.</p>
        )}
      </div>

      {/* Reason */}
      <div className="space-y-2 rounded-md border p-3">
        <h4 className="text-sm font-semibold">Dispute Reason</h4>
        <div className="space-y-1 text-sm">
          <div><span className="text-muted-foreground">Code:</span> <span className="font-mono text-xs">{row.reason_code}</span></div>
          <div><span className="text-muted-foreground">Description:</span> {row.reason_description ?? "-"}</div>
          <div><span className="text-muted-foreground">Network:</span> {row.card_network ? row.card_network.toUpperCase() : "-"}</div>
          <div><span className="text-muted-foreground">PSP Reference:</span> <span className="font-mono text-xs">{row.dispute_psp_reference ?? "-"}</span></div>
          <div><span className="text-muted-foreground">Received:</span> {formatDateTime(row.received_at)}</div>
          {row.resolved_at && (
            <div><span className="text-muted-foreground">Resolved:</span> {formatDateTime(row.resolved_at)}</div>
          )}
          {row.resolution && (
            <div><span className="text-muted-foreground">Resolution:</span> {row.resolution}</div>
          )}
        </div>
      </div>

      {/* Defense */}
      <div className="space-y-2 rounded-md border p-3">
        <h4 className="text-sm font-semibold">Defense</h4>

        {row.defense_documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {row.defense_documents.map((doc, i) => (
              <div key={i} className="flex items-start gap-2 rounded border p-2 text-sm">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{doc.name}</div>
                  {doc.url && (
                    <a href={doc.url} target="_blank" rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline">
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
                disabled={isUploading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? "Uploading…" : "Upload Document"}
              </Button>

              <Button
                size="sm"
                disabled={isSubmitting || row.defense_documents.length === 0}
                onClick={handleSubmitDefense}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                {isSubmitting ? "Submitting…" : "Submit Defense"}
              </Button>
            </>
          )}

          {alreadyDefended && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
              Defense submitted {formatDateTime(row.defense_submitted_at)}
            </div>
          )}
        </div>
      </div>
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
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">TSYS Disputes</h1>
          <p className="text-muted-foreground">Monitor and respond to payment disputes</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isFetching} className="self-start sm:self-auto flex-shrink-0">
          <RefreshCcwDot className="mr-2 h-4 w-4" />
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Disputes</CardTitle>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{pendingCount.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground">Notified or under review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgent</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold text-red-600">{urgentCount.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground">Deadline within 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Under Review</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{(underReviewData?.total ?? 0).toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground">Currently being reviewed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Won / Resolved</CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{resolvedCount.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground">In current page view</p>
          </CardContent>
        </Card>
      </div>

      {/* Table card */}
      <Card>
        <CardHeader>
          <CardTitle>All Disputes</CardTitle>
          <CardDescription>
            Click any row to view details, upload defense documents, or submit a defense response.
          </CardDescription>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Status</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">From</span>
              <input
                type="date"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">To</span>
              <input
                type="date"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              />
            </label>

            {(statusFilter !== "all" || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="self-end" onClick={clearFilters}>
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
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
              <Table containerClassName="max-h-[60vh] overflow-auto rounded-md border">
                <TableHeader className="sticky top-0 z-20 bg-card">
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Card</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => {
                    const isExpanded = expandedId === row.id;
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className={`cursor-pointer ${idx % 2 === 1 ? "bg-muted/20" : ""} ${isExpanded ? "bg-muted/30" : ""}`}
                          onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                        >
                          <TableCell>{getStatusBadge(row.status)}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDate(row.received_at)}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {row.original_payment?.card_last_four
                              ? `****${row.original_payment.card_last_four}`
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(row.amount)}
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-xs">{row.reason_code}</div>
                            {row.reason_description && (
                              <div className="max-w-[200px] truncate text-xs text-muted-foreground">
                                {row.reason_description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{getDeadlineDisplay(row.defense_deadline, row.status)}</TableCell>
                          <TableCell>
                            {row.original_payment?.order_number ? (
                              <Link
                                href={`/dashboard/orders?search=${row.original_payment.order_number}`}
                                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {row.original_payment.order_number}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : !row.original_payment ? (
                              <Badge variant="outline" className="border-gray-300 bg-gray-100 text-gray-600 text-xs">
                                Source unknown
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            }
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow className={idx % 2 === 1 ? "bg-muted/20" : undefined}>
                            <TableCell colSpan={8} className="p-0">
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

              {/* Pagination */}
              <div className="flex flex-col gap-2 pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>Showing {showFrom}–{showTo} of {total.toLocaleString()}</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <span>Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
