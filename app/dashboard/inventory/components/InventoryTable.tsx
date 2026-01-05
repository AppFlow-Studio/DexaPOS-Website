import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InventoryItem } from "../hooks/useInventory";
import { useState, useEffect } from "react";
import { Check, X, AlertTriangle, PackageOpen } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface InventoryTableProps {
  items: InventoryItem[];
  isLoading: boolean;
  onUpdateStock: (itemId: string, quantity: number) => void;
  locationId: string | null;
}

function StockCell({
  item,
  onUpdate,
  locationId,
}: {
  item: InventoryItem;
  onUpdate: (id: string, q: number) => void;
  locationId: string | null;
}) {
  const [value, setValue] = useState(item.current_stock?.toString() || "0");
  const [isEditing, setIsEditing] = useState(false);

  // Reset value when item updates
  useEffect(() => {
    setValue(item.current_stock?.toString() || "0");
  }, [item.current_stock]);

  if (locationId === "all") {
    return (
      <span className="text-muted-foreground italic">Select location</span>
    );
  }

  const handleSave = () => {
    const qty = parseInt(value);
    if (!isNaN(qty)) {
      onUpdate(item.id, qty);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setValue(item.current_stock?.toString() || "0");
    setIsEditing(false);
  };

  if (item.stock_tracking_mode !== "quantity") {
    return (
      <Badge variant="outline" className="opacity-70">
        {item.stock_tracking_mode === "in_stock" ? "In Stock" : "Out of Stock"}
      </Badge>
    );
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-20 h-8"
          min="0"
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
          onClick={handleSave}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive hover:bg-destructive/10"
          onClick={handleCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 cursor-pointer group"
      onClick={() => setIsEditing(true)}
    >
      <span className="font-medium w-8 text-right block">
        {item.current_stock ?? 0}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <span className="text-xs text-primary underline">Edit</span>
      </Button>
    </div>
  );
}

export function InventoryTable({
  items,
  isLoading,
  onUpdateStock,
  locationId,
}: InventoryTableProps) {
  if (isLoading) {
    return (
      <div className="w-full h-96 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center text-muted-foreground border rounded-lg bg-card/50">
        <PackageOpen className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No inventory items found</p>
        {locationId === "all" ? (
          <p className="text-sm">Select a location to manage inventory</p>
        ) : (
          <p className="text-sm">Add items using the menu builder</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[400px]">Item</TableHead>
            <TableHead>Stock Level</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Tracking Mode</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const isLowStock =
              item.stock_tracking_mode === "quantity" &&
              (item.current_stock ?? 0) < 5; // Hardcoded threshold for now
            return (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 rounded-md border">
                      {item.image ? (
                        <AvatarImage
                          src={item.image}
                          alt={item.name}
                          className="object-cover"
                        />
                      ) : (
                        <AvatarFallback className="rounded-md">
                          {item.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.categories.map((c) => c.name).join(", ")}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <StockCell
                    item={item}
                    onUpdate={onUpdateStock}
                    locationId={locationId}
                  />
                </TableCell>
                <TableCell>
                  {isLowStock ? (
                    <Badge
                      variant="outline"
                      className="border-yellow-500 text-yellow-600 bg-yellow-50 flex w-fit items-center gap-1"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Low Stock
                    </Badge>
                  ) : item.stock_tracking_mode === "quantity" &&
                    (item.current_stock ?? 0) > 0 ? (
                    <Badge
                      variant="outline"
                      className="border-green-500 text-green-600 bg-green-50"
                    >
                      In Stock
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground capitalize">
                    {item.stock_tracking_mode?.replace("_", " ") || "Default"}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
