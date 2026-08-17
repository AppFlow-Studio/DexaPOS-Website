'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit2, Trash2, Clock, Cake, PartyPopper, RotateCcw, Share2, Snowflake, Banknote, HandshakeIcon, Package } from 'lucide-react';
import type { Promotion } from '../../../actions/loyalty-programs';

interface PromotionCardProps {
  promotion: Promotion;
  onEdit: (promotion: Promotion) => void;
  onDelete: (promotion: Promotion) => void;
  onToggle: (promotionId: string, isActive: boolean) => void;
  isToggling?: boolean;
}

// Map promo type to icon component. The icons are neutral: a per-type hue here
// is decorative, not functional encoding, and nine of them turn the list into a
// colour key the user has to learn (§4.6b). The glyph carries the type.
const PROMO_ICONS: Record<string, React.ReactNode> = {
  happy_hour: <Clock className="h-5 w-5" />,
  birthday: <Cake className="h-5 w-5" />,
  first_visit: <PartyPopper className="h-5 w-5" />,
  comeback: <RotateCcw className="h-5 w-5" />,
  referral: <Share2 className="h-5 w-5" />,
  seasonal: <Snowflake className="h-5 w-5" />,
  threshold: <Banknote className="h-5 w-5" />,
  bogo: <HandshakeIcon className="h-5 w-5" />,
  bundle: <Package className="h-5 w-5" />,
};

export function PromotionCard({
  promotion,
  onEdit,
  onDelete,
  onToggle,
  isToggling = false,
}: PromotionCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Get promo type label
  const getPromoTypeLabel = () => {
    switch (promotion.promo_type) {
      case 'happy_hour':
        return 'Happy Hour';
      case 'birthday':
        return 'Birthday';
      case 'first_visit':
        return 'First Visit';
      case 'comeback':
        return 'Comeback';
      case 'referral':
        return 'Referral';
      case 'seasonal':
        return 'Seasonal';
      case 'threshold':
        return 'Threshold';
      case 'bogo':
        return 'Buy One Get One';
      case 'bundle':
        return 'Bundle';
      default:
        return promotion.promo_type;
    }
  };

  // Get discount display text
  const getDiscountText = () => {
    if (promotion.discount_type === 'percentage') {
      return `${promotion.discount_value}% off`;
    } else if (promotion.discount_type === 'fixed_amount') {
      return `$${promotion.discount_value?.toFixed(2)} off`;
    } else if (promotion.discount_type === 'free_item') {
      return 'Free item';
    } else if (promotion.discount_type === 'bogo') {
      return `${promotion.bogo_buy_quantity} for ${promotion.bogo_get_quantity}`;
    }
    return '';
  };

  // Get schedule text
  const getScheduleText = () => {
    const parts: string[] = [];

    if (promotion.active_days && promotion.active_days.length > 0) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = promotion.active_days.map((d) => dayNames[d]).join(', ');
      parts.push(days);
    }

    if (promotion.active_time_start && promotion.active_time_end) {
      const start = promotion.active_time_start.substring(0, 5);
      const end = promotion.active_time_end.substring(0, 5);
      parts.push(`${start}-${end}`);
    }

    return parts.length > 0 ? parts.join(' ') : 'Always active';
  };

  const icon = PROMO_ICONS[promotion.promo_type];

  return (
    <div className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          {/* Icon */}
          <div className="mt-0.5 shrink-0 text-muted-foreground">
            {icon || <Snowflake className="h-5 w-5" />}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            {/* Wraps rather than truncating: at 320px the badge would otherwise
                squeeze the name down to a single word. */}
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 text-base font-semibold">{promotion.name}</h3>
              <Badge className="w-fit shrink-0 rounded-full border-0 bg-muted/60 px-2.5 text-xs font-medium text-foreground">
                {getPromoTypeLabel()}
              </Badge>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 text-sm text-muted-foreground">
              <span className="truncate tabular-nums">{getDiscountText()}</span>
              <span className="truncate text-xs tabular-nums">{getScheduleText()}</span>
            </div>
            {promotion.description && (
              <p className="mt-2 text-xs text-muted-foreground">{promotion.description}</p>
            )}
          </div>
        </div>

        {/* Right side: Toggle + Menu */}
        <div className="ml-2 flex shrink-0 items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <Switch
              checked={Boolean(promotion.is_active)}
              onCheckedChange={(checked) => onToggle(promotion.id, checked)}
              disabled={isToggling}
              aria-label="Toggle promotion"
            />
            <span className="hidden whitespace-nowrap text-xs font-medium text-muted-foreground sm:inline">
              {promotion.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>

          {/* Dropdown Menu */}
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => {
                onEdit(promotion);
                setIsOpen(false);
              }}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onDelete(promotion);
                  setIsOpen(false);
                }}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
