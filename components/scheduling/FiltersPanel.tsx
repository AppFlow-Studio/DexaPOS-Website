"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Role } from "@/types/schedule";
import { Filter, X } from "lucide-react";

interface FiltersState {
  roles: Role[];
  employees: string[];
  shiftStatus: ("scheduled" | "open" | "filled" | "cancelled")[];
}

interface FiltersPanelProps {
  employees: { id: string; name: string }[];
  selectedFilters: FiltersState;
  onFiltersChange: (filters: FiltersState) => void;
}

const ROLES: Role[] = ["server", "cashier", "kitchen", "manager", "driver"];
const SHIFT_STATUSES = ["scheduled", "open", "filled", "cancelled"] as const;

export function FiltersPanel({
  employees,
  selectedFilters,
  onFiltersChange,
}: FiltersPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFilterCount =
    selectedFilters.roles.length +
    selectedFilters.employees.length +
    selectedFilters.shiftStatus.length;

  const toggleRole = (role: Role) => {
    const newRoles = selectedFilters.roles.includes(role)
      ? selectedFilters.roles.filter((r) => r !== role)
      : [...selectedFilters.roles, role];
    onFiltersChange({ ...selectedFilters, roles: newRoles });
  };

  const toggleEmployee = (employeeId: string) => {
    const newEmployees = selectedFilters.employees.includes(employeeId)
      ? selectedFilters.employees.filter((e) => e !== employeeId)
      : [...selectedFilters.employees, employeeId];
    onFiltersChange({ ...selectedFilters, employees: newEmployees });
  };

  const toggleStatus = (status: (typeof SHIFT_STATUSES)[number]) => {
    const newStatuses = selectedFilters.shiftStatus.includes(status)
      ? selectedFilters.shiftStatus.filter((s) => s !== status)
      : [...selectedFilters.shiftStatus, status];
    onFiltersChange({ ...selectedFilters, shiftStatus: newStatuses });
  };

  const clearFilters = () => {
    onFiltersChange({ roles: [], employees: [], shiftStatus: [] });
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 rounded-full">
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 w-5 justify-center rounded-full p-0"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 rounded-3xl border-border/60 p-5 shadow-xl"
          align="start"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filters</h4>
              <div className="flex items-center gap-1">
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full px-2 text-xs"
                    onClick={clearFilters}
                  >
                    Clear all
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close filters"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Roles Filter */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Roles</Label>
              <div className="flex flex-wrap gap-1">
                {ROLES.map((role) => (
                  <Button
                    key={role}
                    variant={
                      selectedFilters.roles.includes(role)
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    className="h-7 rounded-full px-3 text-xs capitalize"
                    onClick={() => toggleRole(role)}
                  >
                    {role}
                  </Button>
                ))}
              </div>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Shift Status
              </Label>
              <div className="flex flex-wrap gap-1">
                {SHIFT_STATUSES.map((status) => (
                  <Button
                    key={status}
                    variant={
                      selectedFilters.shiftStatus.includes(status)
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    className="h-7 rounded-full px-3 text-xs capitalize"
                    onClick={() => toggleStatus(status)}
                  >
                    {status}
                  </Button>
                ))}
              </div>
            </div>

            {/* Employees Filter */}
            {employees.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Employees ({selectedFilters.employees.length} selected)
                </Label>
                <div className="max-h-32 space-y-1 overflow-auto rounded-2xl border p-2">
                  {employees.map((emp) => (
                    <div
                      key={emp.id}
                      className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-muted/50"
                    >
                      <Checkbox
                        id={emp.id}
                        checked={selectedFilters.employees.includes(emp.id)}
                        onCheckedChange={() => toggleEmployee(emp.id)}
                      />
                      <Label
                        htmlFor={emp.id}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {emp.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Active Filter Badges */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1">
          {selectedFilters.roles.map((role) => (
            <Badge
              key={role}
              variant="secondary"
              className="gap-1 rounded-full text-xs capitalize"
            >
              {role}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleRole(role)}
              />
            </Badge>
          ))}
          {selectedFilters.shiftStatus.map((status) => (
            <Badge
              key={status}
              variant="secondary"
              className="gap-1 rounded-full text-xs capitalize"
            >
              {status}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleStatus(status)}
              />
            </Badge>
          ))}
          {selectedFilters.employees.length > 0 && (
            <Badge variant="secondary" className="gap-1 rounded-full text-xs">
              {selectedFilters.employees.length} employee(s)
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() =>
                  onFiltersChange({ ...selectedFilters, employees: [] })
                }
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

export default FiltersPanel;
