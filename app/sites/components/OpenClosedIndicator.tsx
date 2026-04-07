"use client";

import { useMemo } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface DaySchedule {
  enabled?: boolean;
  from?: string;
  to?: string;
  is24Hours?: boolean;
  closed?: boolean;
  open?: string;
  close?: string;
  hours?: string;
}

interface OpenClosedIndicatorProps {
  businessHours: any;
  className?: string;
  showSchedule?: boolean;
}

function parseBusinessHours(businessHours: any): Record<string, DaySchedule> {
  if (!businessHours) return {};
  let parsed = businessHours;
  if (typeof businessHours === "string") {
    try { parsed = JSON.parse(businessHours); } catch { return {}; }
  }
  return parsed;
}

function getCurrentDay(): string {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[new Date().getDay()];
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

function isCurrentlyOpen(schedule: DaySchedule | undefined): boolean {
  if (!schedule) return false;
  const isEnabled = schedule.enabled ?? !schedule.closed;
  if (!isEnabled) return false;
  if (schedule.is24Hours) return true;
  const openTime = schedule.from || schedule.open;
  const closeTime = schedule.to || schedule.close;
  if (!openTime || !closeTime) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const open = timeToMinutes(openTime);
  const close = timeToMinutes(closeTime);
  if (close < open) return current >= open || current < close;
  return current >= open && current < close;
}

function formatTime(time: string): string {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${(minutes || 0).toString().padStart(2, "0")} ${period}`;
}

function getOpenUntil(schedule: DaySchedule | undefined): string | null {
  if (!schedule) return null;
  if (schedule.is24Hours) return "Open 24 hours";
  const closeTime = schedule.to || schedule.close;
  if (!closeTime) return null;
  return `Open until ${formatTime(closeTime)}`;
}

export function OpenClosedIndicator({
  businessHours,
  className,
  showSchedule = false,
}: OpenClosedIndicatorProps) {
  const { isOpen, todaySchedule, openUntilText, nextOpenTime } = useMemo(() => {
    const hours = parseBusinessHours(businessHours);
    const currentDay = getCurrentDay();
    const todaySchedule = hours[currentDay];
    const isOpen = isCurrentlyOpen(todaySchedule);
    const openUntilText = isOpen ? getOpenUntil(todaySchedule) : null;

    let nextOpenTime = "";
    if (!isOpen && todaySchedule) {
      const openTime = todaySchedule.from || todaySchedule.open;
      if (openTime) {
        const current = new Date().getHours() * 60 + new Date().getMinutes();
        const open = timeToMinutes(openTime);
        if (current < open) nextOpenTime = formatTime(openTime);
      }
    }

    return { isOpen, todaySchedule, openUntilText, nextOpenTime };
  }, [businessHours]);

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      {isOpen ? (
        <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#6B7280" }}>
          <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} />
          {openUntilText}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#DC2626" }}>
          <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: "#DC2626" }} />
          Closed
          {nextOpenTime && (
            <span style={{ color: "#6B7280" }}>· Opens at {nextOpenTime}</span>
          )}
        </span>
      )}

      {showSchedule && todaySchedule && !openUntilText && (
        <span className="text-xs" style={{ color: "#6B7280" }}>
          {todaySchedule.is24Hours
            ? "24 hours"
            : `${formatTime(todaySchedule.from || todaySchedule.open || "")} – ${formatTime(todaySchedule.to || todaySchedule.close || "")}`}
        </span>
      )}
    </div>
  );
}
