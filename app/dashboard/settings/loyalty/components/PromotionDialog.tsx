'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Promotion, PromotionInsert } from '../../actions/loyalty-programs';

interface PromotionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promotion?: Promotion | null;
  isLoading?: boolean;
  onSubmit: (data: Omit<PromotionInsert, 'merchant_id' | 'created_at' | 'updated_at'>) => void;
}

type PromoType = 'happy_hour' | 'birthday' | 'first_visit' | 'comeback' | 'referral' | 'seasonal' | 'threshold' | 'bogo' | 'bundle';
type DiscountType = 'percentage' | 'fixed_amount' | 'free_item' | 'bogo';

interface FormData {
  name: string;
  description: string | null;
  promo_code: string | null;
  promo_type: PromoType;
  discount_type: DiscountType;
  discount_value: number | null;
  discount_max: number | null;
  free_item_id: string | null;
  applies_to: 'order' | 'item' | 'category';
  target_categories: string[] | null;
  target_item_ids: string[] | null;
  location_ids: string[] | null;
  min_order_amount: number | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  active_days: number[] | null;
  active_time_start: string | null;
  active_time_end: string | null;
  max_uses_total: number | null;
  max_uses_per_customer: number | null;
  max_uses_per_day: number | null;
  comeback_days: number | null;
  birthday_window: 'day' | 'week' | 'month';
  bogo_buy_quantity: number;
  bogo_get_quantity: number;
  bogo_get_item_id: string | null;
  bogo_get_category_id: string | null;
  threshold_amount: number | null;
  auto_apply: boolean;
}

const INITIAL_FORM: FormData = {
  name: '',
  description: null,
  promo_code: null,
  promo_type: 'happy_hour',
  discount_type: 'percentage',
  discount_value: 10,
  discount_max: null,
  free_item_id: null,
  applies_to: 'order',
  target_categories: null,
  target_item_ids: null,
  location_ids: null,
  min_order_amount: null,
  is_active: true,
  starts_at: null,
  ends_at: null,
  active_days: null,
  active_time_start: null,
  active_time_end: null,
  max_uses_total: null,
  max_uses_per_customer: null,
  max_uses_per_day: null,
  comeback_days: 30,
  birthday_window: 'week',
  bogo_buy_quantity: 1,
  bogo_get_quantity: 1,
  bogo_get_item_id: null,
  bogo_get_category_id: null,
  threshold_amount: null,
  auto_apply: false,
};

export function PromotionDialog({
  open,
  onOpenChange,
  promotion,
  isLoading = false,
  onSubmit,
}: PromotionDialogProps) {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const isEditing = !!promotion;

  useEffect(() => {
    if (open) {
      if (promotion) {
        setFormData({
          name: promotion.name || '',
          description: promotion.description || null,
          promo_code: promotion.promo_code || null,
          promo_type: promotion.promo_type as PromoType,
          discount_type: promotion.discount_type as DiscountType,
          discount_value: promotion.discount_value,
          discount_max: promotion.discount_max,
          free_item_id: promotion.free_item_id,
          applies_to: promotion.applies_to as 'order' | 'item' | 'category',
          target_categories: promotion.target_categories,
          target_item_ids: promotion.target_item_ids,
          location_ids: promotion.location_ids,
          min_order_amount: promotion.min_order_amount,
          is_active: promotion.is_active ?? true,
          starts_at: promotion.starts_at,
          ends_at: promotion.ends_at,
          active_days: promotion.active_days,
          active_time_start: promotion.active_time_start,
          active_time_end: promotion.active_time_end,
          max_uses_total: promotion.max_uses_total,
          max_uses_per_customer: promotion.max_uses_per_customer,
          max_uses_per_day: promotion.max_uses_per_day,
          comeback_days: promotion.comeback_days,
          birthday_window: promotion.birthday_window as 'day' | 'week' | 'month',
          bogo_buy_quantity: promotion.bogo_buy_quantity ?? 1,
          bogo_get_quantity: promotion.bogo_get_quantity ?? 1,
          bogo_get_item_id: promotion.bogo_get_item_id,
          bogo_get_category_id: promotion.bogo_get_category_id,
          threshold_amount: promotion.threshold_amount,
          auto_apply: promotion.auto_apply ?? false,
        });
      } else {
        setFormData(INITIAL_FORM);
      }
    }
  }, [open, promotion]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    const submitData: Omit<PromotionInsert, 'merchant_id' | 'created_at' | 'updated_at'> = {
      name: formData.name,
      description: formData.description,
      promo_code: formData.promo_code,
      promo_type: formData.promo_type,
      discount_type: formData.discount_type,
      discount_value: formData.discount_value,
      discount_max: formData.discount_max,
      free_item_id: formData.free_item_id,
      applies_to: formData.applies_to,
      target_categories: formData.target_categories,
      target_item_ids: formData.target_item_ids,
      location_ids: formData.location_ids,
      min_order_amount: formData.min_order_amount,
      is_active: formData.is_active,
      starts_at: formData.starts_at,
      ends_at: formData.ends_at,
      active_days: formData.active_days,
      active_time_start: formData.active_time_start,
      active_time_end: formData.active_time_end,
      max_uses_total: formData.max_uses_total,
      max_uses_per_customer: formData.max_uses_per_customer,
      max_uses_per_day: formData.max_uses_per_day,
      current_uses: promotion?.current_uses ?? 0,
      comeback_days: formData.comeback_days,
      birthday_window: formData.birthday_window,
      bogo_buy_quantity: formData.bogo_buy_quantity,
      bogo_get_quantity: formData.bogo_get_quantity,
      bogo_get_item_id: formData.bogo_get_item_id,
      bogo_get_category_id: formData.bogo_get_category_id,
      threshold_amount: formData.threshold_amount,
      auto_apply: formData.auto_apply,
      total_redemptions: promotion?.total_redemptions ?? 0,
      total_discount_given: promotion?.total_discount_given ?? 0,
      created_by: null,
    };

    onSubmit(submitData);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Promotion' : 'Create Promotion'}</DialogTitle>
          <DialogDescription>
            Set up a new marketing promotion to drive customer engagement
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 mb-4">
          <p className="font-medium mb-1">📢 Merchant-Wide Promotion</p>
          <p>This promotion will be created for your entire merchant. You can optionally limit it to specific locations in <span className="font-semibold">Schedule & Limits</span> tab.</p>
        </div>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="discount">Discount</TabsTrigger>
            <TabsTrigger value="schedule">Schedule & Limits</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Promotion Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Happy Hour Special"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Customer-facing description"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="promo-type">Promotion Type</Label>
              <Select value={formData.promo_type} onValueChange={(value) =>
                setFormData({ ...formData, promo_type: value as PromoType })
              }>
                <SelectTrigger id="promo-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="happy_hour">Happy Hour</SelectItem>
                  <SelectItem value="birthday">Birthday</SelectItem>
                  <SelectItem value="first_visit">First Visit</SelectItem>
                  <SelectItem value="comeback">Comeback</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="seasonal">Seasonal</SelectItem>
                  <SelectItem value="threshold">Threshold</SelectItem>
                  <SelectItem value="bogo">Buy One Get One</SelectItem>
                  <SelectItem value="bundle">Bundle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="promo-code">Promo Code (optional)</Label>
              <Input
                id="promo-code"
                value={formData.promo_code || ''}
                onChange={(e) => setFormData({ ...formData, promo_code: e.target.value })}
                placeholder="e.g., HAPPY20"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="auto-apply"
                checked={formData.auto_apply}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, auto_apply: checked as boolean })
                }
              />
              <Label htmlFor="auto-apply" className="cursor-pointer">
                Auto-apply at checkout
              </Label>
            </div>
          </TabsContent>

          {/* Discount Tab */}
          <TabsContent value="discount" className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>Discount Type</Label>
              <RadioGroup value={formData.discount_type} onValueChange={(value) =>
                setFormData({ ...formData, discount_type: value as DiscountType })
              }>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="percentage" id="discount-percent" />
                  <Label htmlFor="discount-percent" className="cursor-pointer">
                    Percentage off
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="fixed_amount" id="discount-fixed" />
                  <Label htmlFor="discount-fixed" className="cursor-pointer">
                    Fixed amount off
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="free_item" id="discount-free" />
                  <Label htmlFor="discount-free" className="cursor-pointer">
                    Free item
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="bogo" id="discount-bogo" />
                  <Label htmlFor="discount-bogo" className="cursor-pointer">
                    Buy one get one
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="discount-value">Value</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {formData.discount_type === 'percentage' ? '%' : '$'}
                  </span>
                  <Input
                    id="discount-value"
                    type="number"
                    value={formData.discount_value || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discount_value: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="pl-8"
                  />
                </div>
              </div>

              {formData.discount_type === 'percentage' && (
                <div className="space-y-2">
                  <Label htmlFor="discount-max">Max discount ($)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="discount-max"
                      type="number"
                      step="0.01"
                      value={formData.discount_max || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discount_max: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                      className="pl-8"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="min-order">Minimum order amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="min-order"
                  type="number"
                  step="0.01"
                  value={formData.min_order_amount || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      min_order_amount: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                  className="pl-8"
                />
              </div>
            </div>
          </TabsContent>

          {/* Schedule & Limits Tab */}
          <TabsContent value="schedule" className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="starts-at">Start date</Label>
                <Input
                  id="starts-at"
                  type="date"
                  value={formData.starts_at?.substring(0, 10) || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      starts_at: e.target.value ? `${e.target.value}T00:00:00Z` : null,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ends-at">End date</Label>
                <Input
                  id="ends-at"
                  type="date"
                  value={formData.ends_at?.substring(0, 10) || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      ends_at: e.target.value ? `${e.target.value}T23:59:59Z` : null,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="time-start">Start time (optional)</Label>
                <Input
                  id="time-start"
                  type="time"
                  value={formData.active_time_start || ''}
                  onChange={(e) => setFormData({ ...formData, active_time_start: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time-end">End time (optional)</Label>
                <Input
                  id="time-end"
                  type="time"
                  value={formData.active_time_end || ''}
                  onChange={(e) => setFormData({ ...formData, active_time_end: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max-uses">Max uses (total)</Label>
                <Input
                  id="max-uses"
                  type="number"
                  value={formData.max_uses_total || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      max_uses_total: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  placeholder="Leave blank for unlimited"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-per-customer">Max per customer</Label>
                <Input
                  id="max-per-customer"
                  type="number"
                  value={formData.max_uses_per_customer || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      max_uses_per_customer: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  placeholder="Leave blank for unlimited"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-per-day">Max per day</Label>
              <Input
                id="max-per-day"
                type="number"
                value={formData.max_uses_per_day || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    max_uses_per_day: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
                placeholder="Leave blank for unlimited"
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !formData.name}>
            {isLoading ? 'Saving...' : isEditing ? 'Update Promotion' : 'Create Promotion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
