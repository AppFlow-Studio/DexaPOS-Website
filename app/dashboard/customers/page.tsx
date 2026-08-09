"use client";

import { useCustomers } from "./hooks/useCustomers";
import { CustomerList } from "./components/CustomerList";
import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Megaphone, Users } from "lucide-react";
import { CustomerProfileSheet } from "./components/CustomerProfileSheet";
import { CreateCustomerDialog } from "./components/CreateCustomerDialog";
import { CreateCampaignDialog } from "./components/campaigns/CreateCampaignDialog";
import type { CustomerListItem } from "@/types/customer";
import { getCustomerDisplayName } from "@/types/customer";
import {
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
} from "@/components/dashboard/shell";

export default function CustomersPage() {
  const { data: customers = [], isLoading } = useCustomers();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerListItem | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCampaignOpen, setIsCampaignOpen] = useState(false);

  // Deep-link support: ?customerId=<id> (e.g. from global search) auto-opens
  // that customer's profile once the list has loaded, then clears the param so
  // closing the sheet doesn't re-open it.
  const deepLinkCustomerId = searchParams.get("customerId");
  useEffect(() => {
    if (!deepLinkCustomerId || customers.length === 0) return;
    const match = customers.find((c) => c.id === deepLinkCustomerId);
    if (match) {
      const frameId = window.requestAnimationFrame(() => {
        setSelectedCustomer(match);
        setIsProfileOpen(true);
        router.replace("/dashboard/customers");
      });

      return () => window.cancelAnimationFrame(frameId);
    }
  }, [deepLinkCustomerId, customers, router]);

  // Filter customers based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return customers;

    const term = searchTerm.toLowerCase();
    return customers.filter((customer) => {
      const name = getCustomerDisplayName(customer).toLowerCase();
      const email = customer.email?.toLowerCase() || "";
      const phone = customer.phone || "";

      return (
        name.includes(term) || email.includes(term) || phone.includes(term)
      );
    });
  }, [customers, searchTerm]);

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
                : `${filteredData.length} customer${filteredData.length === 1 ? "" : "s"}`}
            </span>
          }
        >
          <div className="relative mb-5 w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or email..."
              className="h-10 rounded-full border-0 bg-muted/60 pl-9 shadow-none focus-visible:ring-1"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <CustomerList
            customers={filteredData}
            isLoading={isLoading}
            onViewProfile={handleViewProfile}
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
