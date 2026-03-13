'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
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

// Map promo type to icon component
const PROMO_ICONS: Record<string, React.ReactNode> = {
  happy_hour: <Clock className="h-5 w-5 text-orange-500" />,
  birthday: <Cake className="h-5 w-5 text-pink-500" />,
  first_visit: <PartyPopper className="h-5 w-5 text-purple-500" />,
  comeback: <RotateCcw className="h-5 w-5 text-cyan-500" />,
  referral: <Share2 className="h-5 w-5 text-emerald-500" />,
  seasonal: <Snowflake className="h-5 w-5 text-blue-400" />,
  threshold: <Banknote className="h-5 w-5 text-green-600" />,
  bogo: <HandshakeIcon className="h-5 w-5 text-rose-500" />,
  bundle: <Package className="h-5 w-5 text-indigo-500" />,
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
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-start gap-4 flex-1">
          {/* Icon */}
          <div className="text-muted-foreground mt-0.5">
            {icon || <Snowflake className="h-5 w-5" />}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-base truncate">{promotion.name}</h3>
              <Badge variant="outline" className="shrink-0">
                {getPromoTypeLabel()}
              </Badge>
            </div>
            <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              <span>{getDiscountText()}</span>
              <span className="text-xs">{getScheduleText()}</span>
            </div>
            {promotion.description && (
              <p className="text-xs text-muted-foreground mt-2">{promotion.description}</p>
            )}
          </div>
        </div>

        {/* Right side: Toggle + Menu */}
        <div className="flex items-center gap-3 ml-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={promotion.is_active}
              onCheckedChange={(checked) => onToggle(promotion.id, checked)}
              disabled={isToggling}
              aria-label="Toggle promotion"
            />
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {promotion.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>

          {/* Dropdown Menu */}
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
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
    </Card>
  );
}
