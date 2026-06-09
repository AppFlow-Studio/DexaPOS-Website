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
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Clock, Cake, PartyPopper, RotateCcw, Share2, Calendar, Banknote, Package } from 'lucide-react';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import type { Promotion, PromotionInsert } from '../../../actions/loyalty-programs';

interface MenuItem {
  id: string;
  name: string;
  price: number;
}

interface PromotionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promotion?: Promotion | null;
  isLoading?: boolean;
  createdBy?: string | null;
  menuItems?: MenuItem[];
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
  application_mode: 'auto_apply' | 'promo_code' | 'manual_only';
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
  application_mode: 'auto_apply',
};

// Promo type definitions
const PROMO_TYPES: Array<{
  value: PromoType;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  { value: 'happy_hour', label: 'Happy Hour', icon: <Clock className="h-5 w-5 text-orange-500" />, description: 'Time-based discounts' },
  { value: 'birthday', label: 'Birthday', icon: <Cake className="h-5 w-5 text-pink-500" />, description: 'Birthday month rewards' },
  { value: 'first_visit', label: 'First Visit', icon: <PartyPopper className="h-5 w-5 text-purple-500" />, description: 'New customer incentive' },
  { value: 'comeback', label: 'Comeback', icon: <RotateCcw className="h-5 w-5 text-cyan-500" />, description: 'Win-back discount' },
  { value: 'referral', label: 'Referral', icon: <Share2 className="h-5 w-5 text-emerald-500" />, description: 'Refer a friend' },
  { value: 'seasonal', label: 'Seasonal', icon: <Calendar className="h-5 w-5 text-blue-400" />, description: 'Holiday/seasonal offer' },
  { value: 'threshold', label: 'Spend Threshold', icon: <Banknote className="h-5 w-5 text-green-600" />, description: 'Reward for spending' },
  { value: 'bogo', label: 'BOGO', icon: <Package className="h-5 w-5 text-rose-500" />, description: 'Buy one get one' },
  { value: 'bundle', label: 'Bundle', icon: <Package className="h-5 w-5 text-indigo-500" />, description: 'Bundle discount' },
];

export function PromotionDialog({
  open,
  onOpenChange,
  promotion,
  isLoading = false,
  createdBy,
  menuItems = [],
  onSubmit,
}: PromotionDialogProps) {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const isEditing = !!promotion;

  const filteredMenuItems = menuItems.filter((item) =>
    item.name.toLowerCase().includes(menuSearchQuery.toLowerCase())
  );

  const selectedMenuItem = menuItems.find((item) => item.id === formData.free_item_id);

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
          application_mode: promotion.auto_apply ? 'auto_apply' : (promotion.promo_code ? 'promo_code' : 'manual_only'),
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
      promo_code: formData.application_mode === 'promo_code' ? (formData.promo_code || '') : null,
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
      auto_apply: formData.application_mode === 'auto_apply',
      total_redemptions: promotion?.total_redemptions ?? 0,
      total_discount_given: promotion?.total_discount_given ?? 0,
      created_by: createdBy || null,
    };

    onSubmit(submitData);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Promotion' : 'Create Promotion'}</DialogTitle>
          <DialogDescription>
            Set up a marketing promotion to drive customer engagement and sales
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Promotion Details</h3>

            <div className="space-y-2">
              <Label htmlFor="name">Promotion Name *</Label>
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
          </div>

          {/* Promo Type Selector Grid */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Promotion Type</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PROMO_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setFormData({ ...formData, promo_type: type.value })}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    formData.promo_type === type.value
                      ? 'border-primary bg-primary/5'
                      : 'border-muted bg-muted/30 hover:border-muted-foreground'
                  }`}
                >
                  <div className="flex justify-center mb-2">{type.icon}</div>
                  <div className="font-medium text-sm">{type.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{type.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Type-Specific Fields */}
          <div className="space-y-4 p-4 bg-muted/20 rounded-lg">
            <h3 className="font-semibold text-sm">Type-Specific Settings</h3>

            {/* Happy Hour - Time fields */}
            {formData.promo_type === 'happy_hour' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="time-start">Start time *</Label>
                    <Input
                      id="time-start"
                      type="time"
                      value={formData.active_time_start || ''}
                      onChange={(e) => setFormData({ ...formData, active_time_start: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time-end">End time *</Label>
                    <Input
                      id="time-end"
                      type="time"
                      value={formData.active_time_end || ''}
                      onChange={(e) => setFormData({ ...formData, active_time_end: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label>Active Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
                      <div key={day} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`day-${idx}`}
                          checked={formData.active_days?.includes(idx) ?? false}
                          onCheckedChange={(checked) => {
                            const days = formData.active_days || [];
                            if (checked) {
                              setFormData({ ...formData, active_days: [...days, idx].sort() });
                            } else {
                              setFormData({
                                ...formData,
                                active_days: days.filter((d) => d !== idx),
                              });
                            }
                          }}
                        />
                        <Label htmlFor={`day-${idx}`} className="text-xs cursor-pointer">
                          {day}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Birthday - Window selector */}
            {formData.promo_type === 'birthday' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="birthday-window">Birthday Window *</Label>
                  <Select
                    value={formData.birthday_window}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        birthday_window: value as 'day' | 'week' | 'month',
                      })
                    }
                  >
                    <SelectTrigger id="birthday-window">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Birthday day only</SelectItem>
                      <SelectItem value="week">Birthday week (±3 days)</SelectItem>
                      <SelectItem value="month">Birthday month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Discount applies automatically on the customer's birthday within the selected window
                </p>
              </div>
            )}

            {/* Comeback - Days input */}
            {formData.promo_type === 'comeback' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="comeback-days">Days of inactivity *</Label>
                  <Input
                    id="comeback-days"
                    type="number"
                    min="1"
                    value={formData.comeback_days || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        comeback_days: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                    placeholder="e.g., 30"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Offer applies to customers who haven't placed an order in X days
                </p>
              </div>
            )}

            {/* Threshold - Spend amount */}
            {formData.promo_type === 'threshold' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="threshold-amount">Minimum order amount *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="threshold-amount"
                      type="number"
                      step="0.01"
                      value={formData.threshold_amount || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          threshold_amount: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                      className="pl-8"
                      placeholder="e.g., 50"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Reward applies when customer spends at or above this amount
                </p>
              </div>
            )}

            {/* BOGO - Buy/Get quantities */}
            {formData.promo_type === 'bogo' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bogo-buy">Buy quantity *</Label>
                    <Input
                      id="bogo-buy"
                      type="number"
                      min="1"
                      value={formData.bogo_buy_quantity}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          bogo_buy_quantity: parseInt(e.target.value) || 1,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bogo-get">Get quantity *</Label>
                    <Input
                      id="bogo-get"
                      type="number"
                      min="1"
                      value={formData.bogo_get_quantity}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          bogo_get_quantity: parseInt(e.target.value) || 1,
                        })
                      }
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Buy X of selected item, get Y free
                </p>
              </div>
            )}

            {/* First Visit, Referral, Seasonal, Bundle - Generic message */}
            {['first_visit', 'referral', 'seasonal', 'bundle'].includes(formData.promo_type) && (
              <div className="text-sm text-muted-foreground">
                Configure discount settings and limits in the sections below
              </div>
            )}
          </div>

          {/* Discount Configuration */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Discount Configuration</h3>

            <div className="space-y-3">
              <Label>Discount Type *</Label>
              <RadioGroup value={formData.discount_type} onValueChange={(value) =>
                setFormData({ ...formData, discount_type: value as DiscountType })
              }>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="percentage" id="discount-percent" />
                  <Label htmlFor="discount-percent" className="cursor-pointer font-normal">
                    Percentage off
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="fixed_amount" id="discount-fixed" />
                  <Label htmlFor="discount-fixed" className="cursor-pointer font-normal">
                    Fixed amount off
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="free_item" id="discount-free" />
                  <Label htmlFor="discount-free" className="cursor-pointer font-normal">
                    Free item
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {formData.discount_type !== 'free_item' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discount-value">Discount Value *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {formData.discount_type === 'percentage' ? '%' : '$'}
                    </span>
                    <Input
                      id="discount-value"
                      type="number"
                      step={formData.discount_type === 'percentage' ? '1' : '0.01'}
                      value={formData.discount_value || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discount_value: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                      className="pl-8"
                      placeholder="e.g., 20"
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
                        placeholder="e.g., 50"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {formData.discount_type === 'free_item' && (
              <div className="space-y-2">
                <Label>Select Free Item *</Label>
                {menuItems && menuItems.length > 0 ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Search items..."
                        value={menuSearchQuery}
                        onChange={(e) => setMenuSearchQuery(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <div className="border rounded-lg bg-muted/30 max-h-48 overflow-y-auto">
                      {filteredMenuItems.length > 0 ? (
                        <div className="divide-y">
                          {filteredMenuItems.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => {
                                setFormData({ ...formData, free_item_id: item.id });
                                setMenuSearchQuery('');
                              }}
                              className={`w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors ${
                                formData.free_item_id === item.id
                                  ? 'bg-primary/10 font-medium'
                                  : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span>{item.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  ${item.price.toFixed(2)}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No items found
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-muted/50 rounded border text-sm text-muted-foreground">
                    No menu items available
                  </div>
                )}
                {selectedMenuItem && (
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded text-sm">
                    <div className="font-medium">{selectedMenuItem.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Price: ${selectedMenuItem.price.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            )}

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
                  placeholder="Leave blank for no minimum"
                />
              </div>
            </div>
          </div>

          {/* Application Mode */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">How Will This Be Applied?</h3>

            <RadioGroup value={formData.application_mode} onValueChange={(value) =>
              setFormData({
                ...formData,
                application_mode: value as 'auto_apply' | 'promo_code' | 'manual_only',
              })
            }>
              <div className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="auto_apply" id="mode-auto" />
                  <Label htmlFor="mode-auto" className="cursor-pointer font-normal">
                    Auto-apply when eligible
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  Automatically applied at checkout when conditions are met
                </p>
              </div>

              <div className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="promo_code" id="mode-code" />
                  <Label htmlFor="mode-code" className="cursor-pointer font-normal">
                    Require promo code
                  </Label>
                </div>
                {formData.application_mode === 'promo_code' && (
                  <div className="ml-6 mt-2 space-y-2">
                    <Label htmlFor="promo-code-input" className="text-sm">
                      Promo Code *
                    </Label>
                    <Input
                      id="promo-code-input"
                      value={formData.promo_code || ''}
                      onChange={(e) => setFormData({ ...formData, promo_code: e.target.value })}
                      placeholder="e.g., SAVE20"
                      className="text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="manual_only" id="mode-manual" />
                  <Label htmlFor="mode-manual" className="cursor-pointer font-normal">
                    Staff must manually apply
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  Only staff can apply this at the point of sale
                </p>
              </div>
            </RadioGroup>
          </div>

          {/* Apply To Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">What Does This Apply To?</h3>

            <div className="space-y-3">
              <Label>Applies To</Label>
              <RadioGroup value={formData.applies_to} onValueChange={(value) =>
                setFormData({
                  ...formData,
                  applies_to: value as 'order' | 'item' | 'category',
                })
              }>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="order" id="applies-order" />
                  <Label htmlFor="applies-order" className="cursor-pointer font-normal">
                    Entire order
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="item" id="applies-item" />
                  <Label htmlFor="applies-item" className="cursor-pointer font-normal">
                    Specific items
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="category" id="applies-category" />
                  <Label htmlFor="applies-category" className="cursor-pointer font-normal">
                    Specific categories
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {formData.applies_to === 'item' && (
              <div className="space-y-2">
                <Label htmlFor="target-items">Target Items (comma-separated IDs)</Label>
                <Input
                  id="target-items"
                  placeholder="e.g., item-1, item-2, item-3"
                  value={formData.target_item_ids?.join(', ') || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      target_item_ids: e.target.value
                        ? e.target.value.split(',').map((id) => id.trim())
                        : null,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to apply to all items
                </p>
              </div>
            )}

            {formData.applies_to === 'category' && (
              <div className="space-y-2">
                <Label htmlFor="target-categories">Target Categories (comma-separated IDs)</Label>
                <Input
                  id="target-categories"
                  placeholder="e.g., cat-1, cat-2, cat-3"
                  value={formData.target_categories?.join(', ') || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      target_categories: e.target.value
                        ? e.target.value.split(',').map((id) => id.trim())
                        : null,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to apply to all categories
                </p>
              </div>
            )}
          </div>

          {/* Schedule & Limits */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Schedule & Limits</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="starts-at">Start date</Label>
                <DateTimePicker
                  id="starts-at"
                  dateOnly
                  value={formData.starts_at}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      starts_at: value ? `${value.substring(0, 10)}T00:00:00Z` : null,
                    })
                  }
                  placeholder="No start date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ends-at">End date</Label>
                <DateTimePicker
                  id="ends-at"
                  dateOnly
                  value={formData.ends_at}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      ends_at: value ? `${value.substring(0, 10)}T23:59:59Z` : null,
                    })
                  }
                  placeholder="No end date"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>

          {/* Active Status */}
          <div className="flex items-center gap-2 p-3 bg-muted/20 rounded-lg">
            <Checkbox
              id="is-active"
              checked={formData.is_active}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_active: checked as boolean })
              }
            />
            <Label htmlFor="is-active" className="cursor-pointer font-normal">
              Active promotion (enable immediately)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isLoading ||
              !formData.name ||
              (formData.application_mode === 'promo_code' && !formData.promo_code)
            }
          >
            {isLoading ? 'Saving...' : isEditing ? 'Update Promotion' : 'Create Promotion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
