"use client";

import { useCustomers, Customer } from "./hooks/useCustomers";
import { CustomerList } from "./components/CustomerList";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { CustomerProfileSheet } from "./components/CustomerProfileSheet";

export default function CustomersPage() {
  const { data, isLoading } = useCustomers();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const filteredData = data.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm)
  );

  const handleViewProfile = (customer: Customer) => {
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
