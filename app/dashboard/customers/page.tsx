"use client";

import { useCustomers } from "./hooks/useCustomers";
import { CustomerList } from "./components/CustomerList";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { CustomerProfileSheet } from "./components/CustomerProfileSheet";
import type { CustomerListItem } from "@/types/customer";
import { getCustomerDisplayName } from "@/types/customer";

export default function CustomersPage() {
  const { data: customers = [], isLoading } = useCustomers();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerListItem | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

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
        <div className="relative w-full sm:w-[300px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
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
    </div>
  );
}
