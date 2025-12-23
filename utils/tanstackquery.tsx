"use client"; // Mark this as a Client Component

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - Data stays fresh for 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes - Keep cached data for 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: false, // Don't refetch on window focus (prevents unnecessary requests)
      refetchOnReconnect: true, // Refetch when network reconnects
      refetchOnMount: true, // Refetch when component mounts (if stale)
      retry: 1, // Retry failed requests once
      retryDelay: 1000, // Wait 1 second before retry
    },
  },
});

export default function TanstackProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}