import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";

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
    <Card className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="shift">Shift Period</Label>
          <Select value={shiftPeriod} onValueChange={onShiftChange}>
            <SelectTrigger id="shift" className="mt-2">
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
    </Card>
  );
}
