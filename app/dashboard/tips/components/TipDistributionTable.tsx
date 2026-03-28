import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit2 } from "lucide-react";
import type { TipDetailWithStaff } from "@/app/dashboard/actions/tips";

interface TipDistributionTableProps {
  details: TipDetailWithStaff[];
  sessionStatus: string;
  onAdjust: (detail: TipDetailWithStaff) => void;
  isLoading?: boolean;
}

export function TipDistributionTable({
  details,
  sessionStatus,
  onAdjust,
  isLoading,
}: TipDistributionTableProps) {
  const formatMoney = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getAdjustmentColor = (amount: number) => {
    if (amount > 0) return "text-green-600";
    if (amount < 0) return "text-red-600";
    return "text-muted-foreground";
  };

  if (isLoading) {
    return (
      <div className="space-y-2 border rounded-lg p-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (details.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        No employee data found for this date and shift period
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">Own Tips</TableHead>
              <TableHead className="text-right">Pool In</TableHead>
              <TableHead className="text-right">Pool Out</TableHead>
              <TableHead className="text-right">T-Out In</TableHead>
              <TableHead className="text-right">T-Out Out</TableHead>
              <TableHead className="text-right">Adj</TableHead>
              <TableHead className="text-right">Net Tips</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {details.map((detail) => (
              <TableRow key={detail.id}>
                <TableCell className="font-medium">
                  {detail.staff_profiles.display_name ||
                    `${detail.staff_profiles.first_name} ${detail.staff_profiles.last_name}`}
                </TableCell>
                <TableCell>{detail.role_code}</TableCell>
                <TableCell className="text-right">
                  {(detail.hours_worked || 0).toFixed(1)}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(detail.individual_tips_earned)}
                </TableCell>
                <TableCell className="text-right text-green-600">
                  {formatMoney(detail.tip_pool_received)}
                </TableCell>
                <TableCell className="text-right text-red-600">
                  {formatMoney(detail.tip_pool_contributed)}
                </TableCell>
                <TableCell className="text-right text-green-600">
                  {formatMoney(detail.tip_out_received)}
                </TableCell>
                <TableCell className="text-right text-red-600">
                  {formatMoney(detail.tip_out_given)}
                </TableCell>
                <TableCell className={`text-right ${getAdjustmentColor(detail.manual_adjustment)}`}>
                  {formatMoney(detail.manual_adjustment)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatMoney(detail.net_tips)}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onAdjust(detail)}
                    disabled={sessionStatus === "approved"}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
