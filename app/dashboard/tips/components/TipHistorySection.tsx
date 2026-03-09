import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TipDistributionSession } from "@/app/dashboard/actions/tips";

interface TipHistorySectionProps {
  sessions: TipDistributionSession[];
  onSelectSession: (sessionDate: string, shiftPeriod: string) => void;
  isLoading?: boolean;
}

const statusStyles: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-gray-100", text: "text-gray-800" },
  calculated: { bg: "bg-yellow-100", text: "text-yellow-800" },
  approved: { bg: "bg-green-100", text: "text-green-800" },
  exported: { bg: "bg-blue-100", text: "text-blue-800" },
  voided: { bg: "bg-red-100", text: "text-red-800" },
};

export function TipHistorySection({
  sessions,
  onSelectSession,
  isLoading,
}: TipHistorySectionProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card className="p-4 text-center text-muted-foreground">
        No distribution history yet
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Recent Distributions</h3>
      <div className="border rounded-lg divide-y">
        {sessions.map((session) => {
          const statusInfo = statusStyles[session.status] || statusStyles.draft;
          return (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.session_date, session.shift_period)}
              className="p-4 hover:bg-muted/50 cursor-pointer transition-colors flex items-center justify-between"
            >
              <div className="flex-1">
                <p className="font-medium">
                  {new Date(session.session_date).toLocaleDateString()} - {session.shift_period}
                </p>
                <p className="text-sm text-muted-foreground">
                  ${(session.total_distributed / 100).toFixed(2)} distributed
                </p>
              </div>
              <div className="flex items-center gap-2">
                {session.approved_at && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(session.approved_at).toLocaleDateString()}
                  </p>
                )}
                <Badge className={`${statusInfo.bg} ${statusInfo.text}`}>
                  {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
