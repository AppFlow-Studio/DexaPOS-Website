"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Gift,
  Plus,
  Trash2,
  Eye,
  Loader2,
  Star,
  Coffee,
  Heart,
  Crown,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { CustomerListItem } from "@/types/customer";
import {
  useMerchantLoyaltyPrograms,
  useCustomerLoyaltyEnrollments,
  useCustomerLoyaltyRewards,
  useCustomerLoyaltyHistory,
  useEnrollInLoyaltyProgram,
  useAddLoyaltyPoints,
  useRedeemLoyaltyReward,
  useVoidLoyaltyReward,
  useCustomerPromotionUsage,
} from "../../hooks/useCustomerLoyalty";

interface LoyaltyTabProps {
  customer: CustomerListItem | null;
  merchantId: string | null;
}

interface StatBoxProps {
  label: string;
  value: string | number;
  subtitle?: string;
}

interface ManualAdjustState {
  open: boolean;
  enrollmentId: string | null;
  enrollmentName: string | null;
}

const iconMap: { [key: string]: React.ReactNode } = {
  star: <Star className="w-6 h-6 text-yellow-400 fill-yellow-400 drop-shadow-md" />,
  coffee: <Coffee className="w-6 h-6 text-amber-600 fill-amber-100 drop-shadow-md" />,
  gift: <Gift className="w-6 h-6 text-pink-500 fill-pink-100 drop-shadow-md" />,
  heart: <Heart className="w-6 h-6 text-red-500 fill-red-100 drop-shadow-md" />,
  crown: <Crown className="w-6 h-6 text-amber-500 fill-amber-100 drop-shadow-md" />,
  lightning: <Zap className="w-6 h-6 text-blue-500 fill-blue-100 drop-shadow-md" />,
};

function StatBox({ label, value, subtitle }: StatBoxProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function getProgressData(enrollment: any, program: any) {
  const programType = program.program_type;

  if (programType === "points") {
    const threshold = program.points_redemption_threshold || 100;
    const current = enrollment.current_points || 0;
    const remaining = Math.max(0, threshold - current);
    return {
      current,
      target: threshold,
      percent: Math.min((current / threshold) * 100, 100),
      label: `${remaining} ${remaining === 1 ? "point" : "points"} away`,
      unit: "pts",
    };
  }

  if (programType === "visits") {
    const target = program.visits_required || 10;
    const current = enrollment.current_visits || 0;
    const remaining = Math.max(0, target - current);
    return {
      current,
      target,
      percent: Math.min((current / target) * 100, 100),
      label: `${remaining} ${remaining === 1 ? "visit" : "visits"} away`,
      unit: "visits",
    };
  }

  if (programType === "punch_card") {
    const target = program.punches_required || 10;
    const current = enrollment.current_punches || 0;
    const remaining = Math.max(0, target - current);
    return {
      current,
      target,
      percent: Math.min((current / target) * 100, 100),
      label: `${remaining} ${remaining === 1 ? "punch" : "punches"} away`,
      unit: "punches",
    };
  }

  return {
    current: 0,
    target: 100,
    percent: 0,
    label: "N/A",
    unit: "pts",
  };
}

function ManualAdjustModal({
  open,
  onOpenChange,
  state,
  onApply,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ManualAdjustState;
  onApply: (action: "add" | "remove", amount: number, reason: string) => void;
  isLoading: boolean;
}) {
  const [action, setAction] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const handleApply = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    onApply(action, Number(amount), reason);
    setAmount("");
    setReason("");
    setAction("add");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manual Adjustment</DialogTitle>
          <DialogDescription>
            Program: {state.enrollmentName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Action</label>
            <RadioGroup value={action} onValueChange={(v: any) => setAction(v)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="add" id="add" />
                <label htmlFor="add" className="cursor-pointer text-sm">
                  Add points
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="remove" id="remove" />
                <label htmlFor="remove" className="cursor-pointer text-sm">
                  Remove points
                </label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <label htmlFor="amount" className="text-sm font-medium">
              Amount
            </label>
            <Input
              id="amount"
              type="number"
              placeholder="e.g., 50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="reason" className="text-sm font-medium">
              Reason
            </label>
            <Input
              id="reason"
              placeholder="e.g., Customer complaint resolution"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={isLoading || !amount}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              "Apply Adjustment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransactionHistorySheet({
  open,
  onOpenChange,
  customerId,
  programId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  programId: string;
}) {
  const { data: history } = useCustomerLoyaltyHistory(
    customerId || null,
    programId || null
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Transaction History</SheetTitle>
        </SheetHeader>

        {history && history.length > 0 ? (
          <div className="mt-6 border rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead className="flex-1">Description</TableHead>
                  <TableHead className="text-right w-20">Change</TableHead>
                  <TableHead className="text-right w-24">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((tx: any) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">{tx.description}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          tx.points_delta >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {tx.points_delta >= 0 ? "+" : ""}
                        {tx.points_delta}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {tx.balance_points}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              No transaction history
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EnrollmentCard({
  enrollment,
  customerId,
  onManualAdjust,
}: {
  enrollment: any;
  customerId: string;
  onManualAdjust: (enrollmentId: string, enrollmentName: string) => void;
}) {
  const program = enrollment.loyalty_programs;
  const progress = getProgressData(enrollment, program);
  const icon = iconMap[program.display_icon] || <Star className="w-6 h-6 text-yellow-500" />;

  const { data: rewards } = useCustomerLoyaltyRewards(
    customerId || null,
    enrollment.program_id || null
  );

  const redeemMutation = useRedeemLoyaltyReward();
  const voidMutation = useVoidLoyaltyReward();
  const [historyOpen, setHistoryOpen] = useState(false);

  const totalSaved = rewards
    ?.filter((r: any) => r.status === "redeemed")
    .reduce((sum: number, r: any) => sum + Number(r.reward_value || 0), 0) || 0;

  const handleRedeemReward = async (rewardId: string) => {
    try {
      await redeemMutation.mutateAsync({ rewardId });
      toast.success("Reward redeemed");
    } catch {
      toast.error("Failed to redeem reward");
    }
  };

  const handleVoidReward = async (rewardId: string) => {
    try {
      await voidMutation.mutateAsync({ rewardId, reason: "Voided by admin" });
      toast.success("Reward voided");
    } catch {
      toast.error("Failed to void reward");
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        {/* Header */}
        <CardHeader className="pb-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0">{icon}</div>
              <div>
                <CardTitle className="text-lg">{program.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Enrolled{" "}
                  {new Date(enrollment.enrolled_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="bg-green-50 text-green-700">
              Active
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* Stat Boxes */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox
              label={progress.unit === "pts" ? "Current Points" : "Current Progress"}
              value={progress.current}
            />
            <StatBox
              label="Lifetime Earned"
              value={
                program.program_type === "points"
                  ? enrollment.lifetime_points || 0
                  : program.program_type === "visits"
                  ? enrollment.lifetime_visits || 0
                  : enrollment.lifetime_punches || 0
              }
            />
            <StatBox
              label="Rewards Earned"
              value={enrollment.total_rewards_earned || 0}
              subtitle={`$${totalSaved.toFixed(2)} saved`}
            />
            <StatBox
              label="Next"
              value={progress.label}
            />
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Progress to Next Reward
              </p>
              <p className="text-xs text-muted-foreground">
                {progress.current} / {progress.target} {progress.unit}
              </p>
            </div>
            <Progress value={progress.percent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {program.reward_description || `Earn a reward`}
            </p>
          </div>

          {/* Available Rewards */}
          {rewards && rewards.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Available Rewards</h4>
              {rewards.map((reward: any) => (
                <div
                  key={reward.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-amber-50 dark:bg-amber-950/20"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Gift className="w-4 h-4 text-pink-500" />
                      {reward.reward_description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {reward.status === "available" && (
                        <>
                          Earned{" "}
                          {new Date(reward.earned_at).toLocaleDateString()}
                          {reward.expires_at &&
                            ` • Expires ${new Date(
                              reward.expires_at
                            ).toLocaleDateString()}`}
                        </>
                      )}
                      {reward.status === "redeemed" && (
                        <>
                          Redeemed{" "}
                          {new Date(reward.redeemed_at).toLocaleDateString()}
                        </>
                      )}
                      {reward.status === "expired" && "Expired"}
                      {reward.status === "voided" && "Voided"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {reward.status === "available" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleRedeemReward(reward.id)}
                          disabled={redeemMutation.isPending}
                        >
                          {redeemMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Redeem"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleVoidReward(reward.id)}
                          disabled={voidMutation.isPending}
                        >
                          {voidMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onManualAdjust(enrollment.id, program.name)}
              className="flex-1"
            >
              <Plus className="w-4 h-4 mr-2" />
              Manual Adjust
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen(true)}
              className="flex-1"
            >
              <Eye className="w-4 h-4 mr-2" />
              View History
            </Button>
          </div>
        </CardContent>
      </Card>

      <TransactionHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        customerId={customerId}
        programId={enrollment.program_id}
      />
    </>
  );
}

function PromotionsSection({
  customerId,
  merchantId,
}: {
  customerId: string;
  merchantId: string;
}) {
  const { data: promotionUsage } = useCustomerPromotionUsage(
    customerId || null,
    merchantId || null
  );

  if (!promotionUsage || promotionUsage.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Promotions Used</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {promotionUsage.slice(0, 5).map((usage: any) => (
            <div
              key={usage.id}
              className="flex items-center justify-between p-2 border-b last:border-0 text-sm"
            >
              <div>
                <p className="font-medium">
                  {new Date(usage.created_at).toLocaleDateString()} •{" "}
                  {usage.promotions?.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Order #{usage.order_id?.slice(0, 8)}
                </p>
              </div>
              <p className="font-medium text-green-600">
                -${Number(usage.discount_applied).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
        {promotionUsage.length > 5 && (
          <p className="text-xs text-muted-foreground text-center">
            +{promotionUsage.length - 5} more promotions used
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function LoyaltyTab({ customer, merchantId }: LoyaltyTabProps) {
  const customerId = customer?.id;
  const [adjustModal, setAdjustModal] = useState<ManualAdjustState>({
    open: false,
    enrollmentId: null,
    enrollmentName: null,
  });

  // Queries
  const { data: programs } = useMerchantLoyaltyPrograms(merchantId);
  const { data: enrollments } = useCustomerLoyaltyEnrollments(customerId ?? null);

  // Mutations
  const enrollMutation = useEnrollInLoyaltyProgram();
  const addPointsMutation = useAddLoyaltyPoints();

  const enrolledProgramIds = new Set(enrollments?.map((e: any) => e.program_id) || []);
  const availablePrograms = programs?.filter(
    (p: any) => !enrolledProgramIds.has(p.id)
  );

  const handleEnroll = async (programId: string) => {
    if (!merchantId || !customerId) return;
    try {
      await enrollMutation.mutateAsync({
        customerId,
        programId,
        merchantId,
      });
      toast.success("Enrolled in loyalty program");
    } catch {
      toast.error("Failed to enroll in program");
    }
  };

  const handleManualAdjust = (enrollmentId: string, enrollmentName: string) => {
    setAdjustModal({
      open: true,
      enrollmentId,
      enrollmentName,
    });
  };

  const handleApplyAdjustment = async (
    action: "add" | "remove",
    amount: number,
    reason: string
  ) => {
    if (!adjustModal.enrollmentId || !merchantId || !customerId) return;

    const enrollment = enrollments?.find(
      (e: any) => e.id === adjustModal.enrollmentId
    );
    if (!enrollment) return;

    try {
      const pointsAmount = action === "add" ? amount : -amount;
      await addPointsMutation.mutateAsync({
        customerId,
        programId: enrollment.program_id,
        merchantId,
        pointsAmount,
        description: reason || `Manual adjustment (${action})`,
      });
      toast.success("Points adjusted");
      setAdjustModal({ open: false, enrollmentId: null, enrollmentName: null });
    } catch {
      toast.error("Failed to adjust points");
    }
  };

  if (!customer) return null;

  // Empty state: no enrollments
  if (!enrollments || enrollments.length === 0) {
    return (
      <div className="space-y-4">
        <Card className="border-dashed border-2">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Gift className="w-12 h-12 mx-auto text-muted-foreground" />
              <div>
                <h3 className="font-medium mb-2">
                  Not enrolled in any loyalty program
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Enroll this customer to start earning rewards
                </p>
              </div>

              {availablePrograms && availablePrograms.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-left">
                    Active programs:
                  </h4>
                  {availablePrograms.map((program: any) => (
                    <div
                      key={program.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-shrink-0">
                          {iconMap[program.display_icon] || <Star className="w-5 h-5 text-yellow-500" />}
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-sm">{program.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Enrollment count not available
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleEnroll(program.id)}
                        disabled={enrollMutation.isPending}
                      >
                        {enrollMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Enrolling...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-2" />
                            Enroll
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No loyalty programs available
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Enrolled: show enrollment cards
  return (
    <div className="space-y-6">
      {enrollments.map((enrollment: any) => (
        <EnrollmentCard
          key={enrollment.id}
          enrollment={enrollment}
          customerId={customerId!}
          onManualAdjust={handleManualAdjust}
        />
      ))}

      <PromotionsSection customerId={customerId!} merchantId={merchantId!} />

      <ManualAdjustModal
        open={adjustModal.open}
        onOpenChange={(open) =>
          setAdjustModal({
            ...adjustModal,
            open,
          })
        }
        state={adjustModal}
        onApply={handleApplyAdjustment}
        isLoading={addPointsMutation.isPending}
      />
    </div>
  );
}
