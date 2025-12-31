"use client";

import { useInventory } from "./hooks/useInventory";
import { InventoryTable } from "./components/InventoryTable";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function InventoryPage() {
  const { items, isLoading, updateStock, locationId } = useInventory();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground">
            Track stock levels and manage inventory across locations
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button asChild>
            <Link href="/dashboard/menu">
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-full sm:w-[300px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search inventory..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <InventoryTable
        items={filteredItems}
        isLoading={isLoading}
        onUpdateStock={(itemId, quantity) => updateStock({ itemId, quantity })}
        locationId={locationId}
      />
    </div>
  );
}
