"use client";

import { useQuery } from "@tanstack/react-query";
import {
  GetCustomerReservations,
  GetCustomerWaitlist,
  GetCustomerDineSessions,
} from "@/app/dashboard/actions/bookings";

export function useCustomerReservations(customerId: string | null) {
  return useQuery({
    queryKey: ["customer", "reservations", customerId],
    queryFn: () =>
      customerId ? GetCustomerReservations(customerId) : Promise.resolve([]),
    enabled: !!customerId,
    staleTime: 30000,
  });
}

export function useCustomerWaitlist(customerId: string | null) {
  return useQuery({
    queryKey: ["customer", "waitlist", customerId],
    queryFn: () =>
      customerId ? GetCustomerWaitlist(customerId) : Promise.resolve([]),
    enabled: !!customerId,
    staleTime: 30000,
  });
}

export function useCustomerDineSessions(customerId: string | null) {
  return useQuery({
    queryKey: ["customer", "dine_sessions", customerId],
    queryFn: () =>
      customerId ? GetCustomerDineSessions(customerId) : Promise.resolve([]),
    enabled: !!customerId,
    staleTime: 30000,
  });
}
