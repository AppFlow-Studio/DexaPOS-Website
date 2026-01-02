"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { DiscountCard } from "@/components/discounts/discount-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteDiscount, useDiscount, useDiscountUsage } from "@/hooks/use-discounts";
import { Discount } from "@/types/discount";

export default function DiscountDetailPage() {
    const params = useParams();
    const router = useRouter();
    const discountId =
        typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : null;

    const { data, isLoading } = useDiscount(discountId);
    const { data: usageData, isLoading: usageLoading } = useDiscountUsage(discountId);
    const deleteMutation = useDeleteDiscount();

    const [deleteMode, setDeleteMode] = useState<"soft" | "hard">("soft");

    const discount: Discount | null = useMemo(
        () => (data?.success && data.data ? (data.data as Discount) : null),
        [data?.data, data?.success]
    );

    const usageCount = usageData?.success ? usageData.data?.usage_count ?? 0 : 0;
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const formattedDays = discount?.applicable_days?.length
        ? discount.applicable_days.map((d) => dayNames[d] ?? String(d)).join(", ")
        : "All";
    const formatTime = (value?: string | null) => (value ? value.slice(0, 5) : "");

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }

    if (!discountId || !discount) {
        return <div className="text-sm text-muted-foreground">Discount not found.</div>;
    }

    const handleDelete = async () => {
        const result = await deleteMutation.mutateAsync({ id: discountId, mode: deleteMode });
        if (result.success) {
            router.push("/dashboard/discounts");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">{discount.name}</h1>
                    <p className="text-sm text-muted-foreground">View discount configuration and usage.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => router.push(`/dashboard/discounts/${discountId}/edit`)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                    </Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete {discount.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Deleting may impact active orders. Choose soft delete to simply disable the discount or hard
                                    delete to remove it entirely.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="space-y-3">
                                <Label>Delete mode</Label>
                                <RadioGroup value={deleteMode} onValueChange={(val) => setDeleteMode(val as "soft" | "hard")}>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="soft" id="delete-soft" />
                                        <Label htmlFor="delete-soft">Soft delete (set inactive)</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="hard" id="delete-hard" />
                                        <Label htmlFor="delete-hard">Hard delete (remove record)</Label>
                                    </div>
                                </RadioGroup>
                            </div>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isPending}>
                                    Confirm
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            <DiscountCard discount={discount} />

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Constraints</CardTitle>
                        <CardDescription>Usage limits and thresholds</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Min purchase</span>
                            <span>{discount.min_purchase_amount ? `$${discount.min_purchase_amount}` : "None"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Max discount amount</span>
                            <span>
                                {discount.max_discount_amount ? `$${discount.max_discount_amount}` : "Not limited"}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>Max uses per day</span>
                            <span>{discount.max_uses_per_day ?? "Unlimited"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Max uses per order</span>
                            <span>{discount.max_uses_per_order}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Stackable</span>
                            <span>{discount.stackable ? "Yes" : "No"}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Targeting</CardTitle>
                        <CardDescription>Scope, categories, and items</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Scope</span>
                            <span className="capitalize">{discount.scope.replace("_", " ")}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Applicable days</span>
                            <span>{formattedDays}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Time window</span>
                            <span>
                                {discount.applicable_hours_start && discount.applicable_hours_end
                                    ? `${formatTime(discount.applicable_hours_start)} - ${formatTime(discount.applicable_hours_end)}`
                                    : "All day"}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>Exclude alcohol</span>
                            <span>{discount.exclude_alcohol ? "Yes" : "No"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Applies to categories</span>
                            <span>{discount.applies_to_categories?.length ?? 0}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Exclude categories</span>
                            <span>{discount.exclude_categories?.length ?? 0}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Approval & usage</CardTitle>
                    <CardDescription>Manager approval and usage data</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4 text-sm">
                    <Badge variant="outline">
                        {discount.requires_manager_approval ? "Requires manager approval" : "No approval required"}
                    </Badge>
                    <Badge variant="outline">
                        Display order: {discount.display_order}
                    </Badge>
                    {usageLoading ? (
                        <Skeleton className="h-6 w-24" />
                    ) : (
                        <Badge variant="secondary">Usage count: {usageCount}</Badge>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

