import { Panel, StatRow, StatTile } from "@/components/dashboard/shell";
import type { TipDistributionSession } from "@/app/dashboard/actions/tips";

interface TipSummaryCardProps {
  session: TipDistributionSession | null;
  isLoading?: boolean;
}

const formatMoney = (amount: number) => `$${amount.toFixed(2)}`;

/**
 * Session totals — DS-CTL-07 / §4.8.
 *
 * One `Panel` holding a `StatRow`, not three `<Card>`s: three separate boxes
 * for three figures of the same session read as unrelated records. `StatTile`
 * carries the label/figure tokens and `tabular-nums`, so nothing is restated
 * here.
 *
 * The rounding adjustment used to render red above $1 and yellow below it.
 * That is status colour-coding (D-12) — the signed figure already says which
 * way it went, and its size says how much.
 */
export function TipSummaryCard({ session, isLoading }: TipSummaryCardProps) {
  if (!session && !isLoading) return null;

  return (
    <Panel>
      <div className="px-6 py-6">
        <StatRow columns={3}>
          <StatTile
            label="Total Collected"
            value={session ? formatMoney(session.total_tips_collected) : "—"}
            isLoading={isLoading}
          />
          <StatTile
            label="Total Distributed"
            value={session ? formatMoney(session.total_distributed) : "—"}
            isLoading={isLoading}
          />
          <StatTile
            label="Rounding Adjustment"
            value={session ? formatMoney(session.rounding_adjustment) : "—"}
            isLoading={isLoading}
          />
        </StatRow>
      </div>
    </Panel>
  );
}
