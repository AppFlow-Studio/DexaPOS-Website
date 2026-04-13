import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TipDistributionSession } from "@/app/dashboard/actions/tips";

interface TipSummaryCardProps {
  session: TipDistributionSession | null;
  isLoading?: boolean;
}

const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function TipSummaryCard({ session, isLoading }: TipSummaryCardProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  if (!session) return null;

  const roundingCents = session.rounding_adjustment;
  const roundingAbsGt1Dollar = Math.abs(roundingCents) > 100;
  const roundingColor = roundingCents === 0
    ? "text-muted-foreground"
    : roundingAbsGt1Dollar
    ? "text-red-600"
    : "text-yellow-600";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <p className={`text-2xl font-bold mt-2 ${roundingColor}`}>
          {formatMoney(roundingCents)}
        </p>
      </Card>
    </div>
  );
}
