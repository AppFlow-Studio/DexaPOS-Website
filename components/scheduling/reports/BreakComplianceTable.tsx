"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export interface ComplianceRecord {
  name: string;
  violations: number;
  missedBreaks: number;
  lateStarts: number;
  earlyOuts: number;
}

interface BreakComplianceTableProps {
  data: ComplianceRecord[];
  onViewAll?: () => void;
}

export function BreakComplianceTable({
  data,
  onViewAll,
}: BreakComplianceTableProps) {
  const getStatus = (record: ComplianceRecord) => {
    if (record.violations > 0) return "violation";
    if (record.missedBreaks > 0 || record.lateStarts > 0) return "review";
    return "compliant";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Break & Time Compliance</CardTitle>
          <CardDescription>
            Monitor labor law compliance and attendance exceptions.
          </CardDescription>
        </div>
        {onViewAll && (
          <Button variant="ghost" size="sm" className="h-8" onClick={onViewAll}>
            View All
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-center">Violations</TableHead>
              <TableHead className="text-center">Missed Breaks</TableHead>
              <TableHead className="text-center">Late Starts</TableHead>
              <TableHead className="text-center">Early Outs</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((record, i) => {
              const status = getStatus(record);
              return (
                <TableRow key={i}>
                  <TableCell className="font-medium">{record.name}</TableCell>
                  <TableCell className="text-center">
                    {record.violations > 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        {record.violations}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {record.missedBreaks > 0 ? (
                      <Badge
                        variant="outline"
                        className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30"
                      >
                        {record.missedBreaks}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {record.lateStarts > 0 ? (
                      <span className="text-sm">{record.lateStarts}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {record.earlyOuts > 0 ? (
                      <span className="text-sm">{record.earlyOuts}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {status === "compliant" && (
                      <div className="flex items-center justify-end gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-xs font-medium">Compliant</span>
                      </div>
                    )}
                    {status === "review" && (
                      <div className="flex items-center justify-end gap-1 text-yellow-600 dark:text-yellow-400">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-xs font-medium">Review</span>
                      </div>
                    )}
                    {status === "violation" && (
                      <div className="flex items-center justify-end gap-1 text-red-600 dark:text-red-400">
                        <XCircle className="h-4 w-4" />
                        <span className="text-xs font-medium">Violation</span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default BreakComplianceTable;
