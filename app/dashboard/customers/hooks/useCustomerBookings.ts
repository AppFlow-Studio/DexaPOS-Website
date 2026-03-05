"use client";

import { useQuery } from "@tanstack/react-query";
import {
  GetCustomerReservations,
  GetCustomerWaitlist,
  GetCustomerDineSessions,
} from "@/app/dashboard/actions/bookings";

export function useCustomerReservations(customerId: string | null, locationId?: string) {
  return useQuery({
    queryKey: ["customer", "reservations", customerId, locationId],
    queryFn: () =>
      customerId ? GetCustomerReservations(customerId, locationId) : Promise.resolve([]),
    enabled: !!customerId,
    staleTime: 30000,
  });
}

export function useCustomerWaitlist(customerId: string | null, locationId?: string) {
  return useQuery({
    queryKey: ["customer", "waitlist", customerId, locationId],
    queryFn: () =>
      customerId ? GetCustomerWaitlist(customerId, locationId) : Promise.resolve([]),
    enabled: !!customerId,
    staleTime: 30000,
  });
}

export function useCustomerDineSessions(customerId: string | null, locationId?: string) {
  return useQuery({
    queryKey: ["customer", "dine_sessions", customerId, locationId],
    queryFn: () =>
      customerId ? GetCustomerDineSessions(customerId, locationId) : Promise.resolve([]),
    enabled: !!customerId,
    staleTime: 30000,
  });
}
