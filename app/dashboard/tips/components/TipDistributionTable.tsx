import { Fragment, useState } from "react";
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
import { cn } from "@/lib/utils";
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from "@/components/dashboard/reports/MobileColumnsButton";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TipDetailWithStaff } from "@/app/dashboard/actions/tips";

interface TipDistributionTableProps {
  details: TipDetailWithStaff[];
  sessionStatus: string;
  onAdjust?: (detail: TipDetailWithStaff) => void;
  isLoading?: boolean;
  readOnly?: boolean;
}

const TIP_DISTRIBUTION_COLUMN_META: ReportColumn[] = [
  { id: "employee", label: "Employee", locked: true },
  { id: "role", label: "Role", defaultHidden: true },
  { id: "hours", label: "Hours", defaultHidden: true },
  { id: "own_tips", label: "Own Tips", defaultHidden: true },
  { id: "pool_in", label: "Pool In", defaultHidden: true },
  { id: "pool_out", label: "Pool Out", defaultHidden: true },
  { id: "t_out_in", label: "T-Out In", defaultHidden: true },
  { id: "t_out_out", label: "T-Out Out", defaultHidden: true },
  { id: "adj", label: "Adj", defaultHidden: true },
  { id: "net_tips", label: "Net Tips", locked: true },
];

export function TipDistributionTable({
  details,
  sessionStatus,
  onAdjust,
  isLoading,
  readOnly,
}: TipDistributionTableProps) {
  const isMobile = useIsMobile();
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(TIP_DISTRIBUTION_COLUMN_META)
  );

  const isColumnVisible = (columnId: string) => !isMobile || !hiddenCols.has(columnId);

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
    <div className="space-y-2 overflow-x-auto">
      <div className="flex justify-start">
        <MobileColumnsButton
          columns={TIP_DISTRIBUTION_COLUMN_META}
          hidden={hiddenCols}
          onChange={setHiddenCols}
        />
      </div>

      <Table variant="data" className="w-full md:min-w-[900px]">
        <TableHeader className="[&_tr]:border-0">
          <TableRow className="hover:bg-transparent">
            {[
              { id: "employee", label: "Employee" },
              { id: "role", label: "Role" },
              { id: "hours", label: "Hours" },
              { id: "own_tips", label: "Own Tips" },
              { id: "pool_in", label: "Pool In" },
              { id: "pool_out", label: "Pool Out" },
              { id: "t_out_in", label: "T-Out In" },
              { id: "t_out_out", label: "T-Out Out" },
              { id: "adj", label: "Adj" },
              { id: "net_tips", label: "Net Tips" },
            ].filter((column) => !isMobile || isColumnVisible(column.id)).map((column) => (
              <TableHead
                key={column.id}
                className={cn(
                  "text-[0.8125rem] font-normal text-muted-foreground",
                  ["hours", "own_tips", "pool_in", "pool_out", "t_out_in", "t_out_out", "adj", "net_tips"].includes(column.id) && "text-right"
                )}
              >
                {column.label}
              </TableHead>
            ))}
            {!readOnly && (
              <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">
                Action
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {details.map((detail) => (
            <TableRow key={detail.id} className="border-0 bg-card/70 transition-colors hover:bg-muted/40">
              {[
                { id: "employee", render: () => (
                  <TableCell className="font-medium">
                    {detail.staff_profiles.display_name ||
                      `${detail.staff_profiles.first_name} ${detail.staff_profiles.last_name}`}
                  </TableCell>
                ) },
                { id: "role", render: () => <TableCell>{detail.role_code}</TableCell> },
                { id: "hours", render: () => (
                  <TableCell className="text-right tabular-nums">
                    {(detail.hours_worked || 0).toFixed(1)}
                  </TableCell>
                ) },
                { id: "own_tips", render: () => (
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(detail.individual_tips_earned)}
                  </TableCell>
                ) },
                { id: "pool_in", render: () => (
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(detail.tip_pool_received)}
                  </TableCell>
                ) },
                { id: "pool_out", render: () => (
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(detail.tip_pool_contributed)}
                  </TableCell>
                ) },
                { id: "t_out_in", render: () => (
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(detail.tip_out_received)}
                  </TableCell>
                ) },
                { id: "t_out_out", render: () => (
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(detail.tip_out_given)}
                  </TableCell>
                ) },
                { id: "adj", render: () => (
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(detail.manual_adjustment)}
                  </TableCell>
                ) },
                { id: "net_tips", render: () => (
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMoney(detail.net_tips)}
                  </TableCell>
                ) },
              ].filter((column) => !isMobile || isColumnVisible(column.id)).map((column) => (
                <Fragment key={column.id}>{column.render()}</Fragment>
              ))}
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
    </div>
  );
}
