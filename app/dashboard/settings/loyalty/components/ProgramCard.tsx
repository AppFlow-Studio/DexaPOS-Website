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
import { Star, Coffee, Hash, MoreVertical, Edit2, Trash2, BarChart3 } from 'lucide-react';
import type { LoyaltyProgram } from '../../../actions/loyalty-programs';

interface ProgramCardProps {
  program: LoyaltyProgram;
  onEdit: (program: LoyaltyProgram) => void;
  onDelete: (program: LoyaltyProgram) => void;
  onToggle: (programId: string, isActive: boolean) => void;
  onAnalytics?: (program: LoyaltyProgram) => void;
  isToggling?: boolean;
}

export function ProgramCard({
  program,
  onEdit,
  onDelete,
  onToggle,
  onAnalytics,
  isToggling = false,
}: ProgramCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Get icon based on program type
  const getIcon = () => {
    switch (program.program_type) {
      case 'points':
        return <Star className="h-5 w-5" style={{ color: program.display_color }} />;
      case 'punch_card':
        return <Coffee className="h-5 w-5" style={{ color: program.display_color }} />;
      case 'visits':
        return <Hash className="h-5 w-5" style={{ color: program.display_color }} />;
      default:
        return <Star className="h-5 w-5" style={{ color: program.display_color }} />;
    }
  };

  // Format program type display
  const getProgramTypeLabel = () => {
    switch (program.program_type) {
      case 'points':
        return 'Points';
      case 'punch_card':
        return 'Punch Card';
      case 'visits':
        return 'Visits';
      default:
        return program.program_type;
    }
  };

  // Get reward type label
  const getRewardTypeLabel = () => {
    switch (program.reward_type) {
      case 'discount_fixed':
        return `$${program.reward_value?.toFixed(2)} off`;
      case 'discount_percent':
        return `${program.reward_value}% off`;
      case 'free_item':
        return 'Free item';
      case 'free_category_item':
        return 'Free category item';
      default:
        return program.reward_description;
    }
  };

  // Build stats text based on program type
  const getStatsText = () => {
    const parts: string[] = [];

    if (program.program_type === 'points' && program.points_redemption_threshold) {
      parts.push(`Redeem at ${program.points_redemption_threshold} pts`);
    } else if (program.program_type === 'visits' && program.visits_required) {
      parts.push(`${program.visits_required} visits`);
    } else if (program.program_type === 'punch_card' && program.punches_required) {
      parts.push(`${program.punches_required} punches`);
    }

    parts.push(getRewardTypeLabel());

    return parts.join(' · ');
  };

  return (
    <Card className="overflow-hidden border-l-4" style={{ borderLeftColor: program.display_color }}>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          {/* Icon */}
          <div className="mt-1 shrink-0">{getIcon()}</div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-base truncate">{program.name}</h3>
              <Badge variant="outline" className="shrink-0">
                {getProgramTypeLabel()}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate">{getStatsText()}</p>
            {program.description && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{program.description}</p>
            )}
          </div>
        </div>

        {/* Right side: Toggle + Menu */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Switch
              checked={program.is_active}
              onCheckedChange={(checked) => onToggle(program.id, checked)}
              disabled={isToggling}
              aria-label="Toggle program"
            />
            <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
              {program.is_active ? 'Active' : 'Inactive'}
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
              {onAnalytics && (
                <DropdownMenuItem onClick={() => {
                  onAnalytics(program);
                  setIsOpen(false);
                }}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analytics
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => {
                onEdit(program);
                setIsOpen(false);
              }}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onDelete(program);
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