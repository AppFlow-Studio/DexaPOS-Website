import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal,
  Calendar,
  DollarSign,
  User as UserIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Customer } from "../hooks/useCustomers";
import { format } from "date-fns";

interface CustomerListProps {
  customers: Customer[];
  isLoading: boolean;
  onViewProfile?: (customer: Customer) => void;
}

export function CustomerList({
  customers,
  isLoading,
  onViewProfile,
}: CustomerListProps) {
  if (isLoading) {
    return (
      <div className="w-full h-96 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center text-muted-foreground border rounded-lg bg-card/50">
        <UserIcon className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No customers found</p>
        <p className="text-sm">Try adjusting your search terms</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Customer</TableHead>
            <TableHead>Total Spend</TableHead>
            <TableHead>Visits</TableHead>
            <TableHead>Last Visit</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id} className="group">
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {customer.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .substring(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{customer.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {customer.phone}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="font-medium">
                  ${customer.totalSpent.toFixed(2)}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-normal">
                  {customer.visitCount} visits
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(customer.lastVisit), "MMM d, yyyy")}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    customer.status === "active"
                      ? "border-green-500/50 text-green-700 bg-green-50 dark:bg-green-900/10 dark:text-green-400"
                      : "border-muted text-muted-foreground"
                  }
                >
                  {customer.status === "active" ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => onViewProfile?.(customer)}>
                      View Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem>View Orders</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                      Delete Customer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
