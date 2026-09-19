"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Megaphone, MessageSquare, RefreshCw, Search } from "lucide-react";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { PageHeader, PageShell, Panel, PanelSection } from "@/components/dashboard/shell";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCampaigns, getMessages } from "./actions";
import type { Campaign, Message, MessageFilters } from "./types";

const date = (value: string | null) => value ? new Date(value).toLocaleString() : "Not available";
const cost = (value: number | null) => value == null ? "Not reported" : Number(value).toFixed(4);

export default function CampaignsPage() {
  const clerkOrgId = useClerkOrgId();
  // Clear open details and filters when switching merchants.
  return <CampaignsWorkspace key={clerkOrgId} clerkOrgId={clerkOrgId} />;
}

function CampaignsWorkspace({ clerkOrgId }: { clerkOrgId: string }) {
  const [tab, setTab] = useState("campaigns");
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  return (
    <PageShell>
      <PageHeader
        title="Campaigns"
        subtitle="Review your campaigns and track SMS delivery and replies across all locations."
        actions={<Button variant="outline" className="rounded-full" asChild><Link href="/dashboard/customers">Manage customers</Link></Button>}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5 rounded-full bg-muted/60 p-1">
          <TabsTrigger value="campaigns" className="gap-2 rounded-full"><Megaphone className="h-4 w-4" />Campaign history</TabsTrigger>
          <TabsTrigger value="messages" className="gap-2 rounded-full"><MessageSquare className="h-4 w-4" />SMS message log</TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns">
          <CampaignHistory clerkOrgId={clerkOrgId} onViewMessages={(selected) => { setCampaign(selected); setTab("messages"); }} />
        </TabsContent>
        <TabsContent value="messages">
          <MessageLog key={campaign?.id ?? "all"} clerkOrgId={clerkOrgId} campaign={campaign} onClearCampaign={() => setCampaign(null)} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function CampaignHistory({ clerkOrgId, onViewMessages }: { clerkOrgId: string; onViewMessages: (campaign: Campaign) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);
  const query = useQuery({
    queryKey: ["campaigns-page", clerkOrgId, page, debouncedSearch],
    queryFn: () => getCampaigns(clerkOrgId, { page, search: debouncedSearch }),
    enabled: !!clerkOrgId,
    refetchInterval: 15_000,
  });
  return (
    <Panel className="border-0">
      <PanelSection icon={Megaphone} label="Campaign history" caption="SMS and email campaigns, including quick messages. Open SMS messages to check delivery results."
        action={<RefreshButton busy={query.isFetching} onClick={() => void query.refetch()} />}>
        <SearchInput label="Search campaigns" placeholder="Search campaign names..." value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
        {query.isError ? <LoadError onRetry={() => void query.refetch()} /> : query.isPending ? <LoadingRows /> : (
          <>
            <p className="my-4 text-sm text-muted-foreground" aria-live="polite">{query.data.pagination.total.toLocaleString()} campaigns</p>
            {query.data.data.length === 0 ? <EmptyState title="No campaigns found" description="Campaigns created from Customers appear here. Try another search or check back after a send." page={page} onReset={() => setPage(1)} /> : (
              <div className="space-y-3">
                {query.data.data.map((item) => (
                  <article key={item.id} className="rounded-2xl bg-muted/40 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words font-semibold">{item.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{date(item.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2"><Badge variant="secondary" className="border-0 uppercase">{item.campaign_type}</Badge><Status value={item.status} /></div>
                    </div>
                    {item.subject && <p className="mt-4 break-words text-sm font-medium">{item.subject}</p>}
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-muted-foreground">View campaign message</summary>
                      <p className="mt-2 whitespace-pre-wrap break-words">{item.body}</p>
                    </details>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground"><span className="font-medium tabular-nums text-foreground">{item.total_recipients ?? 0}</span> recipients{item.scheduled_for && item.status === "scheduled" ? ` · Scheduled ${date(item.scheduled_for)}` : ""}</p>
                      {item.campaign_type === "sms" && <Button variant="secondary" size="sm" className="rounded-full" onClick={() => onViewMessages(item)}>View SMS messages<ArrowUpRight className="ml-1 h-4 w-4" /></Button>}
                    </div>
                  </article>
                ))}
              </div>
            )}
            <PaginationBar pagination={query.data.pagination} onPageChange={setPage} isLoading={query.isFetching} itemLabel="campaigns" />
          </>
        )}
      </PanelSection>
    </Panel>
  );
}

function MessageLog({ clerkOrgId, campaign, onClearCampaign }: { clerkOrgId: string; campaign: Campaign | null; onClearCampaign: () => void }) {
  const [filters, setFilters] = useState<MessageFilters>({ page: 1 });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Message | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const query = useQuery({
    queryKey: ["campaign-message-log", clerkOrgId, filters, debouncedSearch, campaign?.id],
    queryFn: () => getMessages(clerkOrgId, { ...filters, search: debouncedSearch, campaignId: campaign?.id }),
    enabled: !!clerkOrgId,
    refetchInterval: 15_000,
  });
  const update = (patch: MessageFilters) => setFilters((current) => ({ ...current, ...patch, page: 1 }));
  const message = query.data?.data.find((item) => item.id === selected?.id) ?? selected;

  return (
    <>
      <Panel className="border-0">
        <PanelSection icon={MessageSquare} label="SMS message log" caption="Campaigns, order updates, receipts, verification messages, and customer replies. Refreshes every 15 seconds."
          action={<RefreshButton busy={query.isFetching} onClick={() => void query.refetch()} />}>
          {campaign && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-muted/50 p-3"><span className="min-w-0 break-words text-sm">Campaign: <strong>{campaign.name}</strong></span><Button variant="ghost" size="sm" onClick={onClearCampaign}>Show all messages</Button></div>}
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput label="Search SMS messages" placeholder="Search phone numbers or message text..." value={search} onChange={(value) => { setSearch(value); update({}); }} />
            <FilterSelect label="Delivery status" value={filters.status ?? "all"} onChange={(status) => update({ status })} options={[["all", "All statuses"], ["sent", "Sent"], ["delivered", "Delivered"], ["failed", "Failed"], ["received", "Received"], ["pending", "Pending"], ["queued", "Queued"], ["sending", "Sending"]]} />
            <FilterSelect label="Message direction" value={filters.direction ?? "all"} onChange={(direction) => update({ direction })} options={[["all", "Both directions"], ["outbound", "Outbound"], ["inbound", "Inbound"]]} />
            <FilterSelect label="Time period" value={String(filters.days ?? 0)} onChange={(days) => update({ days: Number(days) })} options={[["0", "All time"], ["1", "Last 24 hours"], ["7", "Last 7 days"], ["30", "Last 30 days"]]} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Sent means submitted for delivery. Delivered confirms a delivery callback. Missing cost or sender details are shown as not reported.</p>
          {query.isError ? <LoadError onRetry={() => void query.refetch()} /> : query.isPending ? <LoadingRows /> : (
            <>
              <p className="my-4 text-sm text-muted-foreground" aria-live="polite">{query.data.pagination.total.toLocaleString()} matching messages</p>
              {query.data.data.length === 0 ? <EmptyState title="No SMS messages found" description="Try different filters, or send a test from Online Ordering → Notifications. Only messages recorded for this merchant appear here." page={filters.page ?? 1} onReset={() => update({})} /> : (
                <>
                <div className="space-y-3 md:hidden">
                  {query.data.data.map((item) => (
                    <article key={item.id} className="rounded-2xl bg-muted/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs capitalize text-muted-foreground">{item.direction} SMS</span><Status value={item.status} /></div>
                      <p className="mt-3 break-words text-xs"><span className="text-muted-foreground">From </span>{item.from_number || "Not reported"}</p>
                      <p className="mt-1 break-words text-xs"><span className="text-muted-foreground">To </span>{item.to_number || "Not reported"}</p>
                      <p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm">{item.body || "No message text"}</p>
                      {item.error_code && <p className="mt-2 break-words text-xs text-muted-foreground">Error: {item.error_code}</p>}
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                        <div className="text-xs text-muted-foreground"><p>{date(item.created_at)}</p><p className="mt-1 tabular-nums">Cost: {cost(item.cost)}</p></div>
                        <Button variant="ghost" size="sm" onClick={() => setSelected(item)} aria-label={`View ${item.direction} message ${item.to_number || item.id}`}>View</Button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <caption className="sr-only">SMS delivery history for the current merchant</caption>
                    <thead><tr className="text-xs text-muted-foreground">{["Time / direction", "From / to", "Message", "Status", "Reported cost", "Details"].map((heading) => <th key={heading} scope="col" className="px-3 pb-3 font-medium">{heading}</th>)}</tr></thead>
                    <tbody>
                      {query.data.data.map((item) => (
                        <tr key={item.id} className="align-top odd:bg-muted/35">
                          <td className="rounded-l-xl px-3 py-4"><span className="whitespace-nowrap text-xs">{date(item.created_at)}</span><span className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">{item.direction === "inbound" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}{item.direction === "inbound" ? "Inbound" : "Outbound"}</span></td>
                          <td className="px-3 py-4 text-xs"><p className="whitespace-nowrap"><span className="text-muted-foreground">From </span>{item.from_number || "Not reported"}</p><p className="mt-2 whitespace-nowrap"><span className="text-muted-foreground">To </span>{item.to_number || "Not reported"}</p></td>
                          <td className="max-w-xs px-3 py-4"><p className="line-clamp-2 whitespace-pre-wrap break-words">{item.body || "No message text"}</p>{item.error_code && <p className="mt-2 break-words text-xs text-muted-foreground">Error: {item.error_code}</p>}</td>
                          <td className="px-3 py-4"><Status value={item.status} /></td>
                          <td className="whitespace-nowrap px-3 py-4 text-xs tabular-nums">{cost(item.cost)}</td>
                          <td className="rounded-r-xl px-3 py-3"><Button variant="ghost" size="sm" onClick={() => setSelected(item)} aria-label={`View ${item.direction} message ${item.to_number || item.id}`}>View</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
              <PaginationBar pagination={query.data.pagination} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} isLoading={query.isFetching} itemLabel="messages" />
            </>
          )}
        </PanelSection>
      </Panel>
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 max-sm:max-h-none sm:max-w-2xl">
          <DialogHeader><DialogTitle>Message details</DialogTitle><DialogDescription>Recorded message content and delivery information.</DialogDescription></DialogHeader>
          {message && <>
            <div className="flex items-center gap-2"><Status value={message.status} /><span className="text-xs capitalize text-muted-foreground">{message.direction} SMS</span></div>
            <p className="whitespace-pre-wrap break-words rounded-2xl bg-muted/50 p-4 text-sm">{message.body || "No message text"}</p>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Detail label="From" value={message.from_number} /><Detail label="To" value={message.to_number} />
              <Detail label="Created" value={date(message.created_at)} /><Detail label="Last updated" value={date(message.updated_at)} />
              <Detail label="Event time" value={message.occurred_at ? date(message.occurred_at) : null} /><Detail label="Reported cost" value={cost(message.cost)} />
              <Detail label="Error" value={message.error_code} /><Detail label="Telnyx message ID" value={message.telnyx_message_id} />
              <Detail label="Messaging profile" value={message.messaging_profile_id} /><Detail label="Campaign ID" value={message.campaign_id} />
            </dl>
          </>}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Status({ value }: { value: string | null }) {
  return <Badge variant="secondary" className="whitespace-nowrap rounded-full border-0 font-medium capitalize">{value?.replaceAll("_", " ") || "Unknown"}</Badge>;
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value || "Not reported"}</dd></div>;
}

function SearchInput({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }) {
  return <div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label={label} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-full border-0 bg-muted/60 pl-9 shadow-none" /></div>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="h-10 rounded-full border-0 bg-muted/60 shadow-none"><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select>;
}

function RefreshButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return <Button variant="ghost" size="sm" className="rounded-full" disabled={busy} onClick={onClick}><RefreshCw className={`mr-1.5 h-4 w-4 ${busy ? "animate-spin" : ""}`} />Refresh</Button>;
}

function LoadingRows() {
  return <div className="space-y-3 py-6" role="status" aria-label="Loading records">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-20 w-full rounded-2xl" />)}</div>;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="my-6 rounded-2xl bg-muted/50 p-6"><p className="font-medium">We couldn’t load these records.</p><p className="mt-1 text-sm text-muted-foreground">Check your connection and merchant access, then try again.</p><Button variant="secondary" className="mt-4 rounded-full" onClick={onRetry}>Try again</Button></div>;
}

function EmptyState({ title, description, page, onReset }: { title: string; description: string; page: number; onReset: () => void }) {
  return <div className="py-12 text-center"><MessageSquare className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium">{title}</p><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{description}</p>{page > 1 && <Button variant="ghost" className="mt-4" onClick={onReset}>Back to first page</Button>}</div>;
}
