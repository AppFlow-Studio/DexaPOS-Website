import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { TipDistributionSession } from "@/app/dashboard/actions/tips";

interface TipSummaryCardProps {
  session: TipDistributionSession | null;
  isLoading?: boolean;
}

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-gray-100", text: "text-gray-800", label: "Draft" },
  calculated: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Calculated" },
  approved: { bg: "bg-green-100", text: "text-green-800", label: "Approved" },
  exported: { bg: "bg-blue-100", text: "text-blue-800", label: "Exported" },
  voided: { bg: "bg-red-100", text: "text-red-800", label: "Voided" },
};

const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function TipSummaryCard({ session, isLoading }: TipSummaryCardProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  if (!session) {
    return (
      <Card className="p-4 text-center text-muted-foreground">
        Select a date and click &quot;Calculate Tips&quot; to see the distribution summary
      </Card>
    );
  }

  const statusInfo = statusStyles[session.status] || statusStyles.draft;
  const roundingAmount = session.rounding_adjustment / 100;
  const isBalanced = Math.abs(roundingAmount) < 0.01;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">Total Collected</p>
        <p className="text-2xl font-bold mt-2">
          {formatMoney(session.total_tips_collected)}
        </p>
      </Card>

      <Card className="p-4">
        <p className="text-sm text-muted-foreground">Total Distributed</p>
        <p className="text-2xl font-bold mt-2">
          {formatMoney(session.total_distributed)}
        </p>
      </Card>

      <Card className="p-4">
        <p className="text-sm text-muted-foreground">Rounding Adjustment</p>
        <p className={`text-2xl font-bold mt-2 ${isBalanced ? "text-green-600" : "text-yellow-600"}`}>
          {formatMoney(session.rounding_adjustment)}
        </p>
      </Card>

      <Card className="p-4">
        <p className="text-sm text-muted-foreground">Status</p>
        <Badge className={`mt-2 ${statusInfo.bg} ${statusInfo.text}`}>
          {statusInfo.label}
        </Badge>
      </Card>
    </div>
  );
}
