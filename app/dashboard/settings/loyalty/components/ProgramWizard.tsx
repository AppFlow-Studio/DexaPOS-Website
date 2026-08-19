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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { ChevronLeft, ChevronRight, Star, Coffee, Hash, Loader2, Gift, Target, Flame } from 'lucide-react';
import { useMenuItems } from '../../../hooks/useMenuItems';
import { useCategories } from '../../../hooks/useCategories';
import { useLocations } from '../../../hooks/useLocations';
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.';
import { useClerkOrgId } from '@/app/dashboard/hooks/useLocationScoped';
import { useIsSingleLocation } from '@/stores/location-store';
import type { LoyaltyProgram, LoyaltyProgramInsert } from '../../../actions/loyalty-programs';

interface ProgramWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program?: LoyaltyProgram | null;
  isLoading?: boolean;
  onSubmit: (data: Omit<LoyaltyProgramInsert, 'merchant_id' | 'created_at' | 'updated_at'>) => void;
}

type ProgramType = 'points' | 'punch_card' | 'visits';
type RewardType = 'discount_fixed' | 'discount_percent' | 'free_item' | 'free_category_item';

interface FormData {
  // Basic
  name: string;
  description: string;
  program_type: ProgramType;

  // Points config
  points_per_dollar: number | null;
  points_redemption_threshold: number | null;
  points_redemption_value: number | null;

  // Visits config
  visits_required: number | null;

  // Punch card config
  punch_target_type: 'item' | 'category' | null;
  punch_menu_item_id: string | null;
  punch_category_id: string | null;
  punches_required: number | null;

  // Reward config
  reward_type: RewardType;
  reward_value: number | null;
  reward_description: string;
  reward_menu_item_id: string | null;
  reward_category_id: string | null;
  reward_max_value: number | null;

  // Advanced
  min_order_amount: number | null;
  earn_on_discounted: boolean;
  cooldown_minutes: number | null;
  max_active_rewards: number;
  is_stackable: boolean;
  auto_enroll: boolean;
  reward_expiry_days: number | null;
  display_color: string;
  display_icon: string;
  starts_at: string | null;
  ends_at: string | null;
  location_ids: string[] | null;
  excluded_categories: string[] | null;
  excluded_item_ids: string[] | null;
  created_by: string | null;
}

const INITIAL_FORM: FormData = {
  name: '',
  description: '',
  program_type: 'points',
  points_per_dollar: 1,
  points_redemption_threshold: 100,
  points_redemption_value: 10,
  visits_required: 10,
  punch_target_type: 'item',
  punch_menu_item_id: null,
  punch_category_id: null,
  punches_required: 9,
  reward_type: 'discount_fixed',
  reward_value: 10,
  reward_description: '',
  reward_menu_item_id: null,
  reward_category_id: null,
  reward_max_value: null,
  min_order_amount: 0,
  earn_on_discounted: true,
  cooldown_minutes: 0,
  max_active_rewards: 5,
  is_stackable: false,
  auto_enroll: true,
  reward_expiry_days: 30,
  display_color: '#6366f1',
  display_icon: 'star',
  starts_at: null,
  ends_at: null,
  location_ids: null,
  excluded_categories: null,
  excluded_item_ids: null,
  created_by: null,
};

export function ProgramWizard({
  open,
  onOpenChange,
  program,
  isLoading = false,
  onSubmit,
}: ProgramWizardProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);

  const { data: userInfo } = useUserInfo();
  const clerkOrgId = useClerkOrgId();

  // Fetch menu items and categories
  const { data: menuItems = [], isLoading: itemsLoading } = useMenuItems(clerkOrgId || '');
  const { data: categories = [], isLoading: categoriesLoading } = useCategories(clerkOrgId || '');
  const { data: locations = [], isLoading: locationsLoading } = useLocations(clerkOrgId || '', userInfo?.id || '');
  const isSingleLocation = useIsSingleLocation();

  const isEditing = !!program;
  const menusLoading = itemsLoading || categoriesLoading;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (program) {
        setFormData({
          name: program.name || '',
          description: program.description || '',
          program_type: program.program_type as ProgramType,
          points_per_dollar: program.points_per_dollar,
          points_redemption_threshold: program.points_redemption_threshold,
          points_redemption_value: program.points_redemption_value,
          visits_required: program.visits_required,
          punch_target_type: program.punch_target_type as 'item' | 'category',
          punch_menu_item_id: program.punch_menu_item_id,
          punch_category_id: program.punch_category_id,
          punches_required: program.punches_required,
          reward_type: program.reward_type as RewardType,
          reward_value: program.reward_value,
          reward_description: program.reward_description || '',
          reward_menu_item_id: program.reward_menu_item_id,
          reward_category_id: program.reward_category_id,
          reward_max_value: program.reward_max_value,
          min_order_amount: program.min_order_amount,
          earn_on_discounted: program.earn_on_discounted ?? true,
          cooldown_minutes: program.cooldown_minutes,
          max_active_rewards: program.max_active_rewards ?? 5,
          is_stackable: program.is_stackable ?? false,
          auto_enroll: program.auto_enroll ?? true,
          reward_expiry_days: program.reward_expiry_days,
          display_color: program.display_color || '#6366f1',
          display_icon: program.display_icon || 'star',
          starts_at: program.starts_at,
          ends_at: program.ends_at,
          location_ids: program.location_ids,
          excluded_categories: program.excluded_categories,
          excluded_item_ids: program.excluded_item_ids,
          created_by: program.created_by,
        });
      } else {
        setFormData(INITIAL_FORM);
      }
      setStep(1);
    }
  }, [open, program]);

  const handleClose = () => {
    setStep(1);
    onOpenChange(false);
  };

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    const submitData: Omit<LoyaltyProgramInsert, 'merchant_id' | 'created_at' | 'updated_at'> = {
      name: formData.name,
      description: formData.description || null,
      program_type: formData.program_type,
      points_per_dollar: formData.program_type === 'points' ? formData.points_per_dollar : null,
      points_redemption_threshold: formData.program_type === 'points' ? formData.points_redemption_threshold : null,
      points_redemption_value: formData.program_type === 'points' ? formData.points_redemption_value : null,
      visits_required: formData.program_type === 'visits' ? formData.visits_required : null,
      punch_target_type: formData.program_type === 'punch_card' ? formData.punch_target_type : null,
      punch_menu_item_id: formData.program_type === 'punch_card' ? formData.punch_menu_item_id : null,
      punch_category_id: formData.program_type === 'punch_card' ? formData.punch_category_id : null,
      punches_required: formData.program_type === 'punch_card' ? formData.punches_required : null,
      reward_type: formData.reward_type,
      reward_value: formData.reward_value,
      reward_description: formData.reward_description,
      reward_menu_item_id: ['free_item'].includes(formData.reward_type) ? formData.reward_menu_item_id : null,
      reward_category_id: ['free_category_item'].includes(formData.reward_type) ? formData.reward_category_id : null,
      reward_max_value: ['discount_percent', 'free_category_item'].includes(formData.reward_type) ? formData.reward_max_value : null,
      min_order_amount: formData.min_order_amount,
      earn_on_discounted: formData.earn_on_discounted,
      cooldown_minutes: formData.cooldown_minutes,
      max_active_rewards: formData.max_active_rewards,
      is_stackable: formData.is_stackable,
      auto_enroll: formData.auto_enroll,
      reward_expiry_days: formData.reward_expiry_days,
      display_color: formData.display_color,
      display_icon: formData.display_icon,
      starts_at: formData.starts_at,
      ends_at: formData.ends_at,
      location_ids: formData.location_ids,
      excluded_categories: formData.excluded_categories,
      excluded_item_ids: formData.excluded_item_ids,
      is_active: true,
      created_by: isEditing ? formData.created_by : userInfo?.id || null,
    };

    onSubmit(submitData);
    handleClose();
  };

  // Step 1: Type Selection
  const renderStep1 = () => (
    <div className="space-y-4">
      {/* Selection is a ring on a muted tile, not a `--primary` border: the
          primary token is violet, not the brand blue (C5), and a border here
          would be the only one on the panel. */}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
        {(
          [
            { type: 'visits', icon: Hash, title: 'Visits', blurb: 'Reward after X visits.' },
            { type: 'points', icon: Star, title: 'Points', blurb: 'Earn points per $ spent.' },
            { type: 'punch_card', icon: Coffee, title: 'Punch Card', blurb: 'Buy X, get 1 free.' },
          ] as const
        ).map(({ type, icon: Icon, title, blurb }) => (
          <button
            key={type}
            type="button"
            aria-pressed={formData.program_type === type}
            onClick={() => setFormData({ ...formData, program_type: type })}
            className={`min-w-0 cursor-pointer rounded-2xl border-0 p-4 text-left shadow-none transition-colors ${
              formData.program_type === type
                ? 'bg-muted ring-1 ring-border'
                : 'bg-muted/45 hover:bg-muted'
            }`}
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <Icon className="h-8 w-8 text-muted-foreground" />
              <h4 className="font-semibold">{title}</h4>
              <p className="text-sm text-muted-foreground">{blurb}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // Step 2: Basic Config
  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="min-w-0 rounded-2xl border-0 bg-muted/60 p-3 text-sm text-muted-foreground shadow-none">
        <p className="font-medium mb-1">📢 {isSingleLocation ? "Loyalty Program" : "Merchant-Wide Program"}</p>
        <p>
          {isSingleLocation
            ? "This program will be created for your business."
            : (
              <>This program will be created for your entire merchant. You can optionally limit it to specific locations in <span className="font-semibold">Advanced Settings → Schedule</span>.</>
            )}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Program Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Coffee Rewards Club"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Shown to customers..."
          rows={2}
        />
      </div>

      {/* Points specific */}
      {formData.program_type === 'points' && (
        <div className="min-w-0 space-y-4 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
          <h4 className="font-semibold text-sm">Points Configuration</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ppd">Points per $1 *</Label>
              <Input
                id="ppd"
                type="number"
                step="0.1"
                min="0.1"
                value={formData.points_per_dollar || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    points_per_dollar: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="threshold">Redeem at (points) *</Label>
              <Input
                id="threshold"
                type="number"
                value={formData.points_redemption_threshold || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    points_redemption_threshold: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pvalue">Worth ($) *</Label>
              <Input
                id="pvalue"
                type="number"
                step="0.01"
                value={formData.points_redemption_value || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    points_redemption_value: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Visits specific */}
      {formData.program_type === 'visits' && (
        <div className="min-w-0 space-y-4 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
          <h4 className="font-semibold text-sm">Visits Configuration</h4>
          <div className="space-y-2">
            <Label htmlFor="visits">Visits to earn reward *</Label>
            <Input
              id="visits"
              type="number"
              value={formData.visits_required || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  visits_required: e.target.value ? parseInt(e.target.value) : null,
                })
              }
            />
          </div>
        </div>
      )}

      {/* Punch Card specific */}
      {formData.program_type === 'punch_card' && (
        <div className="min-w-0 space-y-4 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
          <h4 className="font-semibold text-sm">Punch Card Configuration</h4>
          <div className="space-y-3">
            <Label>Target Type *</Label>
            <RadioGroup
              value={formData.punch_target_type || ''}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  punch_target_type: value as 'item' | 'category',
                  punch_menu_item_id: null,
                  punch_category_id: null,
                })
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="item" id="punch-item" />
                <Label htmlFor="punch-item" className="cursor-pointer">
                  Specific Menu Item
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="category" id="punch-category" />
                <Label htmlFor="punch-category" className="cursor-pointer">
                  Category
                </Label>
              </div>
            </RadioGroup>
          </div>

          {formData.punch_target_type === 'item' && (
            <div className="space-y-2">
              <Label htmlFor="punch-item-id">Menu Item</Label>
              <Select
                value={formData.punch_menu_item_id || ''}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    punch_menu_item_id: value || null,
                  })
                }
              >
                <SelectTrigger id="punch-item-id" disabled={menusLoading}>
                  <SelectValue placeholder="Select a menu item" />
                </SelectTrigger>
                <SelectContent>
                  {menuItems.map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {formData.punch_target_type === 'category' && (
            <div className="space-y-2">
              <Label htmlFor="punch-cat-id">Category</Label>
              <Select
                value={formData.punch_category_id || ''}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    punch_category_id: value || null,
                  })
                }
              >
                <SelectTrigger id="punch-cat-id" disabled={menusLoading}>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="punches">Punches to earn reward *</Label>
            <Input
              id="punches"
              type="number"
              value={formData.punches_required || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  punches_required: e.target.value ? parseInt(e.target.value) : null,
                })
              }
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="min-order">Min order amount ($)</Label>
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
        />
      </div>
    </div>
  );

  // Step 3: Reward Config
  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="space-y-3">
        <Label>Reward Type *</Label>
        <RadioGroup
          value={formData.reward_type}
          onValueChange={(value) =>
            setFormData({ ...formData, reward_type: value as RewardType })
          }
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="discount_fixed" id="rf" />
            <Label htmlFor="rf" className="cursor-pointer">
              Fixed Dollar Off
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="discount_percent" id="rp" />
            <Label htmlFor="rp" className="cursor-pointer">
              Percentage Off
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="free_item" id="rfi" />
            <Label htmlFor="rfi" className="cursor-pointer">
              Free Specific Item
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="free_category_item" id="rfci" />
            <Label htmlFor="rfci" className="cursor-pointer">
              Free Item from Category
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="reward-val">Reward Value *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {formData.reward_type === 'discount_percent' ? '%' : '$'}
            </span>
            <Input
              id="reward-val"
              type="number"
              step={formData.reward_type === 'discount_percent' ? '1' : '0.01'}
              value={formData.reward_value || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  reward_value: e.target.value ? parseFloat(e.target.value) : null,
                })
              }
              className="pl-8"
            />
          </div>
        </div>

        {['discount_percent', 'free_category_item'].includes(formData.reward_type) && (
          <div className="space-y-2">
            <Label htmlFor="reward-max">Max Value ($)</Label>
            <Input
              id="reward-max"
              type="number"
              step="0.01"
              value={formData.reward_max_value || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  reward_max_value: e.target.value ? parseFloat(e.target.value) : null,
                })
              }
            />
          </div>
        )}
      </div>

      {formData.reward_type === 'free_item' && (
        <div className="space-y-2">
          <Label htmlFor="reward-item-id">Menu Item *</Label>
          <Select
            value={formData.reward_menu_item_id || ''}
            onValueChange={(value) =>
              setFormData({
                ...formData,
                reward_menu_item_id: value || null,
              })
            }
          >
            <SelectTrigger id="reward-item-id" disabled={menusLoading}>
              <SelectValue placeholder="Select a menu item" />
            </SelectTrigger>
            <SelectContent>
              {menuItems.map((item: any) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {formData.reward_type === 'free_category_item' && (
        <div className="space-y-2">
          <Label htmlFor="reward-cat-id">Category *</Label>
          <Select
            value={formData.reward_category_id || ''}
            onValueChange={(value) =>
              setFormData({
                ...formData,
                reward_category_id: value || null,
              })
            }
          >
            <SelectTrigger id="reward-cat-id" disabled={menusLoading}>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat: any) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="reward-desc">Reward Description (shown to customers) *</Label>
        <Textarea
          id="reward-desc"
          value={formData.reward_description}
          onChange={(e) => setFormData({ ...formData, reward_description: e.target.value })}
          placeholder="e.g., Free medium coffee of your choice"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="expiry">Reward expiry (days)</Label>
        <Input
          id="expiry"
          type="number"
          value={formData.reward_expiry_days || ''}
          onChange={(e) =>
            setFormData({
              ...formData,
              reward_expiry_days: e.target.value ? parseInt(e.target.value) : null,
            })
          }
          placeholder="Leave blank for no expiry"
        />
      </div>
    </div>
  );

  // Step 4: Advanced Settings
  const renderStep4 = () => (
    <Tabs defaultValue="rules" className="w-full">
      {/* §4.5 pill rail. Classes are literal, not {TOKEN} — Tailwind does not
          scan `.ts` (C7). */}
      <div className="w-full min-w-0 overflow-x-auto pb-1">
        <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
          {[
            { value: 'rules', label: 'Rules' },
            { value: 'schedule', label: 'Schedule' },
            { value: 'display', label: 'Display' },
          ].map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {/* Rules Tab */}
      <TabsContent value="rules" className="space-y-4 py-4">
        <div className="min-w-0 space-y-3 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-enroll" className="cursor-pointer">
              Auto-enroll customers
            </Label>
            <Checkbox
              id="auto-enroll"
              checked={formData.auto_enroll}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, auto_enroll: checked as boolean })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">Auto-enroll when customer identified at POS</p>
        </div>

        <div className="min-w-0 space-y-3 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
          <div className="flex items-center justify-between">
            <Label htmlFor="earn-disc" className="cursor-pointer">
              Earn on discounted orders
            </Label>
            <Checkbox
              id="earn-disc"
              checked={formData.earn_on_discounted}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, earn_on_discounted: checked as boolean })
              }
            />
          </div>
        </div>

        <div className="min-w-0 space-y-3 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
          <div className="flex items-center justify-between">
            <Label htmlFor="stackable" className="cursor-pointer">
              Stackable rewards
            </Label>
            <Checkbox
              id="stackable"
              checked={formData.is_stackable}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_stackable: checked as boolean })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">Multiple rewards per order</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cooldown">Cooldown (minutes)</Label>
            <Input
              id="cooldown"
              type="number"
              value={formData.cooldown_minutes || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  cooldown_minutes: e.target.value ? parseInt(e.target.value) : null,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-rewards">Max unredeemed</Label>
            <Input
              id="max-rewards"
              type="number"
              value={formData.max_active_rewards}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  max_active_rewards: parseInt(e.target.value) || 5,
                })
              }
            />
          </div>
        </div>

        <div className="min-w-0 space-y-4 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
          <h4 className="font-semibold text-sm">Exclusions (Optional)</h4>

          <div className="space-y-3">
            <Label>Exclude Categories</Label>
            <div className="thin-scrollbar min-w-0 max-h-40 space-y-2 overflow-y-auto rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
              {categoriesLoading ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading categories...
                </div>
              ) : categories.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No categories available</p>
              ) : (
                categories.map((cat: any) => (
                  <div key={cat.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`exc-cat-${cat.id}`}
                      checked={formData.excluded_categories?.includes(cat.id) ?? false}
                      onCheckedChange={(checked) => {
                        const newExcluded = formData.excluded_categories ? [...formData.excluded_categories] : [];
                        if (checked) {
                          if (!newExcluded.includes(cat.id)) {
                            newExcluded.push(cat.id);
                          }
                        } else {
                          const index = newExcluded.indexOf(cat.id);
                          if (index > -1) {
                            newExcluded.splice(index, 1);
                          }
                        }
                        setFormData({
                          ...formData,
                          excluded_categories: newExcluded.length > 0 ? newExcluded : null,
                        });
                      }}
                    />
                    <Label htmlFor={`exc-cat-${cat.id}`} className="cursor-pointer text-sm font-normal">
                      {cat.name}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Exclude Menu Items</Label>
            <div className="thin-scrollbar min-w-0 max-h-40 space-y-2 overflow-y-auto rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
              {itemsLoading ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading menu items...
                </div>
              ) : menuItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No menu items available</p>
              ) : (
                menuItems.map((item: any) => (
                  <div key={item.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`exc-item-${item.id}`}
                      checked={formData.excluded_item_ids?.includes(item.id) ?? false}
                      onCheckedChange={(checked) => {
                        const newExcluded = formData.excluded_item_ids ? [...formData.excluded_item_ids] : [];
                        if (checked) {
                          if (!newExcluded.includes(item.id)) {
                            newExcluded.push(item.id);
                          }
                        } else {
                          const index = newExcluded.indexOf(item.id);
                          if (index > -1) {
                            newExcluded.splice(index, 1);
                          }
                        }
                        setFormData({
                          ...formData,
                          excluded_item_ids: newExcluded.length > 0 ? newExcluded : null,
                        });
                      }}
                    />
                    <Label htmlFor={`exc-item-${item.id}`} className="cursor-pointer text-sm font-normal">
                      {item.name}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </TabsContent>

      {/* Schedule Tab */}
      <TabsContent value="schedule" className="space-y-4 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="starts">Start date</Label>
            <DateTimePicker
              id="starts"
              value={formData.starts_at}
              onChange={(value) => setFormData({ ...formData, starts_at: value })}
              placeholder="No start date"
              className="border-0 bg-muted/60 shadow-none"
              compactCalendar
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ends">End date</Label>
            <DateTimePicker
              id="ends"
              value={formData.ends_at}
              onChange={(value) => setFormData({ ...formData, ends_at: value })}
              placeholder="No end date"
              className="border-0 bg-muted/60 shadow-none"
              align="end"
              compactCalendar
            />
          </div>
        </div>

        {/* Location targeting — hidden for single-location accounts; the
            program silently applies to the one location (location_ids = null). */}
        {!isSingleLocation && (
        <div className="space-y-3">
          <div>
            <Label>Locations (optional)</Label>
            <p className="text-xs text-muted-foreground mt-1">Leave all unchecked to apply to all locations</p>
          </div>
          <div className="thin-scrollbar min-w-0 max-h-40 space-y-2 overflow-y-auto rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
            {locationsLoading ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading locations...
              </div>
            ) : locations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No locations found</p>
            ) : (
              locations.map((location: any) => (
                <div key={location.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`loc-${location.id}`}
                    checked={formData.location_ids?.includes(location.id) ?? false}
                    onCheckedChange={(checked) => {
                      const newLocationIds = formData.location_ids ? [...formData.location_ids] : [];
                      if (checked) {
                        if (!newLocationIds.includes(location.id)) {
                          newLocationIds.push(location.id);
                        }
                      } else {
                        const index = newLocationIds.indexOf(location.id);
                        if (index > -1) {
                          newLocationIds.splice(index, 1);
                        }
                      }
                      setFormData({
                        ...formData,
                        location_ids: newLocationIds.length > 0 ? newLocationIds : null,
                      });
                    }}
                  />
                  <Label htmlFor={`loc-${location.id}`} className="cursor-pointer text-sm font-normal">
                    {location.name}
                  </Label>
                </div>
              ))
            )}
          </div>
        </div>
        )}
      </TabsContent>

      {/* Display Tab */}
      <TabsContent value="display" className="space-y-4 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="color">Display Color</Label>
            <div className="flex gap-2">
              <Input
                id="color"
                type="color"
                value={formData.display_color}
                onChange={(e) => setFormData({ ...formData, display_color: e.target.value })}
                className="w-12 h-9 p-1"
              />
              <Input
                type="text"
                value={formData.display_color}
                onChange={(e) => setFormData({ ...formData, display_color: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="icon">Icon</Label>
            <Select value={formData.display_icon} onValueChange={(value) =>
              setFormData({ ...formData, display_icon: value })
            }>
              <SelectTrigger id="icon">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top" position="popper">
                {/* The glyph is the choice being made; the hue was decoration
                    on top of it (§4.6b). Colour lives on the program's own
                    `display_color` swatch below, not here. */}
                <SelectItem value="star">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    Star
                  </div>
                </SelectItem>
                <SelectItem value="coffee">
                  <div className="flex items-center gap-2">
                    <Coffee className="h-4 w-4" />
                    Coffee
                  </div>
                </SelectItem>
                <SelectItem value="gift">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4" />
                    Gift
                  </div>
                </SelectItem>
                <SelectItem value="fire">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4" />
                    Fire
                  </div>
                </SelectItem>
                <SelectItem value="target">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Target
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );

  const stepTitles = ['Choose Type', 'Basic Config', 'Reward Config', 'Advanced Settings'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wizard — full screen below `sm` (§13.1). The dialog clips and the body
          below is the only scroller, so the bar tracks the panel edge. */}
      <DialogContent className="thin-scrollbar flex h-dvh max-h-dvh w-screen max-w-none flex-col overflow-y-auto overscroll-contain rounded-none sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:rounded-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEditing ? 'Edit Program' : 'Create Loyalty Program'}</DialogTitle>
          <DialogDescription>
            Step <span className="tabular-nums">{step}</span> of{' '}
            <span className="tabular-nums">{stepTitles.length}</span>: {stepTitles[step - 1]}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-0 py-4 [&_input]:border-0 [&_input]:bg-muted/60 [&_input]:shadow-none [&_textarea]:border-0 [&_textarea]:bg-muted/60 [&_textarea]:shadow-none [&_[data-slot=select-trigger]]:border-0 [&_[data-slot=select-trigger]]:bg-muted/60 [&_[data-slot=select-trigger]]:shadow-none">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        <DialogFooter className="flex shrink-0 justify-center gap-2 sm:justify-center">
          <Button variant="outline" onClick={handleBack} disabled={step === 1}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="flex gap-2">
            {step < stepTitles.length ? (
              <Button onClick={handleNext}>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={
                  isLoading ||
                  !formData.name ||
                  !formData.program_type ||
                  !formData.reward_description ||
                  !formData.reward_type ||
                  formData.reward_value === null
                }
              >
                {isLoading ? 'Saving...' : isEditing ? 'Update Program' : 'Launch Program'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
