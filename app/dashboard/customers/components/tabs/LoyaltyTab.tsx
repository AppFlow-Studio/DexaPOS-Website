"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Gift,
  Plus,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  useCustomerLoyaltyEnrollments,
  useCustomerLoyaltyBalance,
  useCustomerLoyaltyLifetimePoints,
  useCustomerLoyaltyRewards,
  useCustomerLoyaltyHistory,
  useMerchantLoyaltyPrograms,
  useEnrollInLoyaltyProgram,
  useAddLoyaltyPoints,
  useRedeemLoyaltyReward,
} from "../../hooks/useCustomerLoyalty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import type { CustomerListItem } from "@/types/customer";

interface LoyaltyTabProps {
  customer: CustomerListItem | null;
  merchantId: string | null;
}

export function LoyaltyTab({ customer, merchantId }: LoyaltyTabProps) {
  const customerId = customer?.id;
  const [selectedProgram, setSelectedProgram] = useState<string>("");
  const [pointsToAdd, setPointsToAdd] = useState("");
  const [addPointsReason, setAddPointsReason] = useState("");

  // Queries
  const { data: programs } = useMerchantLoyaltyPrograms(merchantId);
  const { data: enrollments } = useCustomerLoyaltyEnrollments(customerId ?? null);

  // Set first program by default when enrollments load
  useEffect(() => {
    if (!selectedProgram && enrollments && enrollments.length > 0) {
      setSelectedProgram((enrollments[0] as any)?.id || "");
    }
  }, [enrollments, selectedProgram]);
  const { data: currentBalance } = useCustomerLoyaltyBalance(
    customerId ?? null,
    selectedProgram || null
  );
  const { data: lifetimePoints } = useCustomerLoyaltyLifetimePoints(
    customerId ?? null,
    selectedProgram || null
  );
  const { data: rewards } = useCustomerLoyaltyRewards(
    customerId ?? null,
    selectedProgram || null
  );
  const { data: history } = useCustomerLoyaltyHistory(
    customerId ?? null,
    selectedProgram || null
  );

  // Mutations
  const enrollMutation = useEnrollInLoyaltyProgram();
  const addPointsMutation = useAddLoyaltyPoints();
  const redeemMutation = useRedeemLoyaltyReward();

  const enrolledProgramIds = new Set(enrollments?.map((p: any) => p.id) || []);
  const availablePrograms = programs?.filter(
    (p: any) => !enrolledProgramIds.has(p.id)
  );
  const selectedProgramData = programs?.find((p: any) => p.id === selectedProgram);

  const handleEnroll = async (programId: string) => {
    if (!merchantId) return;
    await enrollMutation.mutateAsync({
      customerId: customerId!,
      programId,
      merchantId,
    });
    setSelectedProgram(programId);
  };

  const handleAddPoints = async () => {
    if (!pointsToAdd || !selectedProgram || !merchantId) return;
    await addPointsMutation.mutateAsync({
      customerId: customerId!,
      programId: selectedProgram,
      merchantId,
      pointsAmount: parseInt(pointsToAdd, 10),
      description: addPointsReason || `Manual adjustment`,
      staffId: undefined,
    });
    setPointsToAdd("");
    setAddPointsReason("");
  };

  const handleRedeemReward = async (rewardId: string) => {
    await redeemMutation.mutateAsync({ rewardId });
  };

  if (!customer) return null;

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
                  Enroll this customer to start earning points
                </p>
              </div>

              {availablePrograms && availablePrograms.length > 0 ? (
                <div className="space-y-2">
                  {availablePrograms.map((program: any) => (
                    <Button
                      key={program.id}
                      onClick={() => handleEnroll(program.id)}
                      disabled={enrollMutation.isPending}
                      className="w-full"
                    >
                      {enrollMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Enrolling...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Enroll in {program.name}
                        </>
                      )}
                    </Button>
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

  return (
    <div className="space-y-6">
      {/* Program Selection */}
      {enrollments.length > 1 && (
        <div>
          <label className="text-sm font-medium">Select Program</label>
          <Select value={selectedProgram} onValueChange={setSelectedProgram}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a program" />
            </SelectTrigger>
            <SelectContent>
              {enrollments.map((program: any) => (
                <SelectItem key={program.id} value={program.id}>
                  {program.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {enrollments.length === 1 && !selectedProgram && (
        <div className="hidden" />
      )}

      {!selectedProgram && enrollments.length === 1 && (
        <div
          onClick={() =>
            setSelectedProgram((enrollments[0] as any)?.id || "")
          }
          className="hidden"
        />
      )}

      {selectedProgram && selectedProgramData && (
        <>
          {/* Points Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Current Points
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {currentBalance ?? 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Lifetime Earned
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {lifetimePoints ?? 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Rewards Earned
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{rewards?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  ${(rewards?.filter((r: any) => r.status === "redeemed").reduce((sum: number, r: any) => sum + Number(r.reward_value), 0) || 0).toFixed(2)} saved
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Program
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="outline">{selectedProgramData.program_type}</Badge>
              </CardContent>
            </Card>
          </div>

          {/* Progress toward next reward */}
          {selectedProgramData.reward_type && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Progress to Next Reward</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {selectedProgramData.reward_description ||
                    `${selectedProgramData.reward_type} reward - ${selectedProgramData.reward_value}`}
                </p>
                <Progress
                  value={Math.min(
                    ((currentBalance ?? 0) / 500) * 100,
                    100
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  {currentBalance ?? 0} / 500 points (example threshold)
                </p>
              </CardContent>
            </Card>
          )}

          {/* Available Rewards */}
          {rewards && rewards.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Available Rewards</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rewards.map((reward: any) => (
                  <div
                    key={reward.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {reward.reward_description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {reward.status === "available" && (
                          <>
                            Earned{" "}
                            {new Date(reward.earned_at).toLocaleDateString()}
                            {reward.expires_at &&
                              ` • Expires ${new Date(reward.expires_at).toLocaleDateString()}`}
                          </>
                        )}
                        {reward.status === "redeemed" && (
                          <>
                            Redeemed{" "}
                            {new Date(reward.redeemed_at).toLocaleDateString()}
                          </>
                        )}
                        {reward.status === "expired" && "Expired"}
                      </p>
                    </div>
                    {reward.status === "available" && (
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
                    )}
                    {reward.status === "redeemed" && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                    {reward.status === "expired" && (
                      <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Admin: Add Points */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Adjust Points (Admin)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Points Amount</label>
                <Input
                  type="number"
                  placeholder="e.g., 50"
                  value={pointsToAdd}
                  onChange={(e) => setPointsToAdd(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason</label>
                <Input
                  placeholder="e.g., Customer complaint - cold coffee"
                  value={addPointsReason}
                  onChange={(e) => setAddPointsReason(e.target.value)}
                />
              </div>
              <Button
                onClick={handleAddPoints}
                disabled={!pointsToAdd || addPointsMutation.isPending}
                className="w-full"
              >
                {addPointsMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Points
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Transaction History */}
          {history && history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Points History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {history.map((tx: any) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-2 border-b last:border-0"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-sm font-medium ${
                            tx.points_amount >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {tx.points_amount >= 0 ? "+" : ""}
                          {tx.points_amount}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Balance: {tx.balance_after}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
