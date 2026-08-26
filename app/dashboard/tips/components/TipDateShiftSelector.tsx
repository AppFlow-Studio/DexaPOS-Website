import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Clock } from "lucide-react";

interface TipDateShiftSelectorProps {
  date: string;
  shiftPeriod: "full_day" | "lunch" | "dinner" | "custom";
  onDateChange: (date: string) => void;
  onShiftChange: (shift: string) => void;
}

export function TipDateShiftSelector({
  date,
  shiftPeriod,
  onDateChange,
  onShiftChange,
}: TipDateShiftSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-1 py-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="h-9 w-40 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
        <Select value={shiftPeriod} onValueChange={onShiftChange}>
          <SelectTrigger id="shift" className="h-9 w-36 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full_day">Full Day</SelectItem>
            <SelectItem value="lunch">Lunch</SelectItem>
            <SelectItem value="dinner">Dinner</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
