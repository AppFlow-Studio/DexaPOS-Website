"use client";

import { useCustomerProfile, useCustomers } from "./hooks/useCustomers";
import { CustomerList } from "./components/CustomerList";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Megaphone, Users } from "lucide-react";
import { CustomerProfileSheet } from "./components/CustomerProfileSheet";
import { CreateCustomerDialog } from "./components/CreateCustomerDialog";
import { CreateCampaignDialog } from "./components/campaigns/CreateCampaignDialog";
import type { CustomerListItem } from "@/types/customer";
import { PaginationBar } from "@/components/dashboard/PaginationBar";
import { buildPaginationMeta } from "@/lib/pagination";
import { useDebounce } from "@/lib/hooks/useDebounce";
import {
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
} from "@/components/dashboard/shell";

export default function CustomersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);
  const requestedPage = Number(searchParams.get("page"));
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage))
    : 1;
  const pageSize = 25;
  const {
    data: customerResult,
    isLoading,
    isFetching,
  } = useCustomers({
    page,
    pageSize,
    search: debouncedSearch || undefined,
  });
  const customers = useMemo(
    () => customerResult?.data ?? [],
    [customerResult?.data],
  );
  const pagination =
    customerResult?.pagination ?? buildPaginationMeta(0, { page, pageSize });
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerListItem | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCampaignOpen, setIsCampaignOpen] = useState(false);

  // Deep-link support: ?customerId=<id> (e.g. from global search) auto-opens
  // that customer's profile once the list has loaded, then clears the param so
  // closing the sheet doesn't re-open it.
  const deepLinkCustomerId = searchParams.get("customerId");
  const { data: deepLinkProfile } = useCustomerProfile(deepLinkCustomerId);

  const setPage = useCallback((nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete("page");
    else params.set("page", String(nextPage));
    const query = params.toString();
    router.replace(query ? `/dashboard/customers?${query}` : "/dashboard/customers", {
      scroll: false,
    });
  }, [router, searchParams]);

  useEffect(() => {
    if (!deepLinkCustomerId) return;
    const currentPageMatch = customers.find((c) => c.id === deepLinkCustomerId);
    const profileCustomer = deepLinkProfile?.customer;
    const match: CustomerListItem | undefined =
      currentPageMatch ||
      (profileCustomer
        ? {
            id: profileCustomer.id,
            name: profileCustomer.name,
            phone: profileCustomer.phone,
            email: profileCustomer.email,
            lifetime_spend: profileCustomer.lifetime_spend,
            visits: profileCustomer.visits,
            last_visit: profileCustomer.last_visit,
            total_orders: profileCustomer.total_orders,
            avg_spend: profileCustomer.avg_spend,
            tags: profileCustomer.tags,
          }
        : undefined);
    if (match) {
      const frameId = window.requestAnimationFrame(() => {
        setSelectedCustomer(match);
        setIsProfileOpen(true);
        router.replace("/dashboard/customers");
      });

      return () => window.cancelAnimationFrame(frameId);
    }
  }, [deepLinkCustomerId, deepLinkProfile, customers, router]);

  useEffect(() => {
    if (customerResult && page > customerResult.pagination.totalPages) {
      setPage(customerResult.pagination.totalPages);
    }
  }, [customerResult, page, setPage]);

  const handleViewProfile = (customer: CustomerListItem) => {
    setSelectedCustomer(customer);
    setIsProfileOpen(true);
  };

  return (
    <PageShell>
      <PageHeader
        title="Customers"
        subtitle="Manage customer profiles, activity, and order history."
        actions={
          <>
            <Button
              variant="outline"
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={() => setIsCampaignOpen(true)}
            >
              <Megaphone className="mr-1.5 h-4 w-4" />
              Create Campaign
            </Button>
            <Button
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Customer
            </Button>
          </>
        }
      />

      <Panel>
        <PanelSection
          icon={Users}
          label="Customer directory"
          caption="Search customer records and open a profile to review activity."
          action={
            <span className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground tabular-nums">
              {isLoading
                ? "Loading customers"
                : `${pagination.total.toLocaleString()} customer${pagination.total === 1 ? "" : "s"}`}
            </span>
          }
        >
          <div className="relative mb-5 w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or email..."
              className="h-10 rounded-full border-0 bg-muted/60 pl-9 shadow-none focus-visible:ring-1"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                if (page !== 1) setPage(1);
              }}
            />
          </div>

          <CustomerList
            customers={customers}
            isLoading={isLoading}
            onViewProfile={handleViewProfile}
          />
          <PaginationBar
            pagination={pagination}
            onPageChange={setPage}
            isLoading={isFetching}
            itemLabel="customers"
          />
        </PanelSection>
      </Panel>

      <CustomerProfileSheet
        customer={selectedCustomer}
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
      />

      <CreateCustomerDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      <CreateCampaignDialog
        open={isCampaignOpen}
        onOpenChange={setIsCampaignOpen}
      />
    </PageShell>
  );
}
