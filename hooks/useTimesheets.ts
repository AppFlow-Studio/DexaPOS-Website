import { useQuery } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { StaffShift } from "@/types/staff";
import { DateRange } from "react-day-picker";
import { startOfDay, endOfDay } from "date-fns";

interface TimesheetFilters {
  dateRange: DateRange | undefined;
  locationIds: string[];
  employeeIds: string[];
}

export const useTimesheets = (filters: TimesheetFilters) => {
  const supabase = useSupabaseClient();

  return useQuery({
    queryKey: ["timesheets", filters],
    queryFn: async () => {
      const from = filters.dateRange?.from
        ? startOfDay(filters.dateRange.from).toISOString()
        : null;
      const to = filters.dateRange?.to
        ? endOfDay(filters.dateRange.to).toISOString()
        : filters.dateRange?.from
        ? endOfDay(filters.dateRange.from).toISOString()
        : null;

      if (!from || !to) return [];

      let query = supabase
        .from("staff_shifts")
        .select(
          `
          id, 
          status, 
          clock_in_time, 
          clock_out_time, 
          break_logs, 
          hourly_rate_snapshot, 
          created_at,
          merchant_id,
          location_id,
          staff_profile_id,
          staff_profile:staff_profiles(first_name, last_name, avatar_url),
          location:locations(name)
          `
        )
        .gte("clock_in_time", from)
        .lte("clock_in_time", to)
        .order("clock_in_time", { ascending: false });

      if (filters.locationIds.length > 0) {
        query = query.in("location_id", filters.locationIds);
      }

      if (filters.employeeIds.length > 0) {
        query = query.in("staff_profile_id", filters.employeeIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Cast to unkown first because of the joined fields structure
      return data as unknown as StaffShift[];
    },
    enabled: !!filters.dateRange?.from,
  });
};

export const useTimesheetResources = () => {
  const supabase = useSupabaseClient();

  return useQuery({
    queryKey: ["timesheet-resources"],
    queryFn: async () => {
      // Fetch all accessible resources (RLS will filter by merchant)
      const [staffRes, locRes] = await Promise.all([
        supabase
          .from("staff_profiles")
          .select("id, first_name, last_name, avatar_url"),
        supabase.from("locations").select("id, name"),
      ]);

      if (staffRes.error) throw staffRes.error;
      if (locRes.error) throw locRes.error;

      return {
        staff: staffRes.data || [],
        locations: locRes.data || [],
      };
    },
  });
};
