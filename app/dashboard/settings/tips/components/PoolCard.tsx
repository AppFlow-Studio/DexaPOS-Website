import { Trash2, Edit2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { TipPoolConfigWithShares, Role } from "@/app/dashboard/actions/tips";

interface PoolCardProps {
  pool: TipPoolConfigWithShares;
  roles: Role[];
  onEdit: (pool: TipPoolConfigWithShares) => void;
  onDelete: (pool: TipPoolConfigWithShares) => void;
  onToggle: (poolId: string, isActive: boolean) => void;
  isToggling?: boolean;
}

const methodLabels: Record<string, string> = {
  percentage: "Percentage",
  hours_weighted: "Hours Weighted",
  equal_split: "Equal Split",
  points: "Points-Based",
};

const sourceLabels: Record<string, string> = {
  charged_tips: "Charged Tips",
  all_tips: "All Tips",
  cash_only: "Cash Only",
};

export function PoolCard({
  pool,
  roles,
  onEdit,
  onDelete,
  onToggle,
  isToggling,
}: PoolCardProps) {
  const getRoleName = (code: string) => {
    return roles.find((r) => r.code === code)?.name || code;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{pool.name}</CardTitle>
            {pool.description && <CardDescription>{pool.description}</CardDescription>}
          </div>
          <Switch
            checked={pool.is_active}
            onCheckedChange={(checked) => onToggle(pool.id, checked)}
            disabled={isToggling}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Distribution Method</p>
            <Badge variant="outline" className="mt-1">
              {methodLabels[pool.distribution_method] || pool.distribution_method}
            </Badge>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Tip Source</p>
            <Badge variant="outline" className="mt-1">
              {sourceLabels[pool.tip_source] || pool.tip_source}
            </Badge>
          </div>
        </div>

        {pool.source_percentage < 100 && (
          <div className="p-2 bg-muted/50 rounded text-sm">
            <p className="text-muted-foreground">Source Percentage: {pool.source_percentage}%</p>
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Contributing Roles</p>
          <div className="flex flex-wrap gap-2">
            {pool.contributing_role_codes.map((code) => (
              <Badge key={code} variant="secondary" className="text-xs">
                <span className="font-semibold">{code}</span>
                <span className="ml-1">- {getRoleName(code)}</span>
              </Badge>
            ))}
          </div>
        </div>

        {pool.tip_pool_role_shares.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Role Shares</p>
            <div className="bg-muted/30 rounded p-3 space-y-1">
              {pool.tip_pool_role_shares.map((share) => (
                <div key={share.role_code} className="flex justify-between text-sm">
                  <span className="font-medium">
                    <span className="font-bold text-foreground">{share.role_code}</span>
                    <span className="ml-1 text-muted-foreground">({getRoleName(share.role_code)})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {share.share_percentage !== null
                      ? `${share.share_percentage}%`
                      : `${share.points_per_hour} pts/hr`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(pool)}
            className="flex-1"
          >
            <Edit2 className="w-4 h-4 mr-1" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(pool)}
            className="flex-1 text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
