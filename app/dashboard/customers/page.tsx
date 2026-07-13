"use client";

import { useCustomers } from "./hooks/useCustomers";
import { CustomerList } from "./components/CustomerList";
import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Megaphone } from "lucide-react";
import { CustomerProfileSheet } from "./components/CustomerProfileSheet";
import { CreateCustomerDialog } from "./components/CreateCustomerDialog";
import { CreateCampaignDialog } from "./components/campaigns/CreateCampaignDialog";
import type { CustomerListItem } from "@/types/customer";
import { getCustomerDisplayName } from "@/types/customer";

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
      setSelectedCustomer(match);
      setIsProfileOpen(true);
      router.replace("/dashboard/customers");
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Customers</h2>
          <p className="text-muted-foreground">
            Manage your customer database and view order history
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-[300px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => setIsCampaignOpen(true)}>
            <Megaphone className="h-4 w-4 mr-2" />
            Create Campaign
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Customer
          </Button>
        </div>
      </div>

      <CustomerList
        customers={filteredData}
        isLoading={isLoading}
        onViewProfile={handleViewProfile}
      />

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
    </div>
  );
}
