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
  onAdjust?: (detail: TipDetailWithStaff) => void;
  isLoading?: boolean;
  readOnly?: boolean;
}

export function TipDistributionTable({
  details,
  sessionStatus,
  onAdjust,
  isLoading,
  readOnly,
}: TipDistributionTableProps) {
  const formatMoney = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-2 rounded-2xl bg-muted/20 p-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (details.length === 0) {
    return (
      <div className="rounded-2xl bg-muted/20 p-8 text-center text-muted-foreground">
        No employee data found for this date and shift period
      </div>
    );
  }

  // §5: `variant="data"` owns the surface — rounded tinted well, no frame, no
  // row lines — so the table is not wrapped in a bordered box or a Panel.
  // Money direction is carried by the column headers (Pool In / Pool Out), not
  // by green/red text: per §4.6b colour is not a status channel.
  return (
    <Table variant="data" className="min-w-[900px]">
          <TableHeader className="[&_tr]:border-0">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Employee</TableHead>
              <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Role</TableHead>
              <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Hours</TableHead>
              <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Own Tips</TableHead>
              <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Pool In</TableHead>
              <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Pool Out</TableHead>
              <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">T-Out In</TableHead>
              <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">T-Out Out</TableHead>
              <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Adj</TableHead>
              <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Net Tips</TableHead>
              {!readOnly && <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {details.map((detail) => (
              <TableRow key={detail.id} className="border-0 bg-card/70 transition-colors hover:bg-muted/40">
                <TableCell className="font-medium">
                  {detail.staff_profiles.display_name ||
                    `${detail.staff_profiles.first_name} ${detail.staff_profiles.last_name}`}
                </TableCell>
                <TableCell>{detail.role_code}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(detail.hours_worked || 0).toFixed(1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(detail.individual_tips_earned)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(detail.tip_pool_received)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(detail.tip_pool_contributed)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(detail.tip_out_received)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(detail.tip_out_given)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(detail.manual_adjustment)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatMoney(detail.net_tips)}
                </TableCell>
                {!readOnly && (
                  <TableCell>
                    {/* §5.2 — row actions are rounded-full ghost icon buttons */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 rounded-full p-0"
                      onClick={() => onAdjust?.(detail)}
                      disabled={sessionStatus === "approved"}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
    </Table>
  );
}
