import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Customer } from "../hooks/useCustomers";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, MapPin, Calendar, Clock } from "lucide-react";

interface CustomerProfileSheetProps {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerProfileSheet({
  customer,
  open,
  onOpenChange,
}: CustomerProfileSheetProps) {
  if (!customer) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className=" w-5xl  overflow-y-auto px-2">
        <SheetHeader className="mb-6">
          <div className="flex flex-col items-center text-center gap-4">
            <Avatar className="h-24 w-24">
              <AvatarFallback className="text-2xl">
                {customer.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .substring(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle className="text-2xl">{customer.name}</SheetTitle>
              <SheetDescription className="mt-1">
                Customer since {new Date().getFullYear()}
              </SheetDescription>
            </div>
            <Badge
              variant={customer.status === "active" ? "default" : "secondary"}
              className={
                customer.status === "active"
                  ? "bg-green-500 hover:bg-green-600"
                  : ""
              }
            >
              {customer.status === "active" ? "Active Customer" : "Inactive"}
            </Badge>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="border rounded-md p-3">
              <div className="text-2xl font-bold">{customer.visitCount}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                Visits
              </div>
            </div>
            <div className="border rounded-md p-3">
              <div className="text-2xl font-bold">
                ${customer.totalSpent.toFixed(0)}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                Spent
              </div>
            </div>
            <div className="border rounded-md p-3">
              <div className="text-2xl font-bold">
                {Math.floor(customer.totalSpent / customer.visitCount)}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                Avg Order
              </div>
            </div>
          </div>

          <Separator />

          {/* Contact Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
              Contact Information
            </h3>
            <div className="grid gap-3">
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{customer.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{customer.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>123 Main St, San Francisco, CA</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Recent Activity (Mock) */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
              Recent Orders
            </h3>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Order #{1000 + i}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(
                          Date.now() - i * 86400000
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      ${(Math.random() * 50 + 20).toFixed(2)}
                    </p>
                    <Badge variant="outline" className="text-[10px] h-5">
                      Completed
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
