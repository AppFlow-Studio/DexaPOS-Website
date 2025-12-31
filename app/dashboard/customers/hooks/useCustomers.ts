import { useState, useEffect } from "react";

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalSpent: number;
  visitCount: number;
  lastVisit: string;
  status: "active" | "inactive";
}

const MOCK_CUSTOMERS: Customer[] = [
  {
    id: "cust_1",
    name: "Samir Kadi",
    email: "skadi18@yahoo.com",
    phone: "(718) 419-0927",
    totalSpent: 1245.5,
    visitCount: 12,
    lastVisit: "2024-12-28",
    status: "active",
  },
  {
    id: "cust_2",
    name: "Sarah Jenkins",
    email: "sarah.j@gmail.com",
    phone: "(555) 123-4567",
    totalSpent: 850.75,
    visitCount: 8,
    lastVisit: "2024-12-25",
    status: "active",
  },
  {
    id: "cust_3",
    name: "Michael Chen",
    email: "mchen@tech.co",
    phone: "(415) 555-9876",
    totalSpent: 2100.0,
    visitCount: 25,
    lastVisit: "2024-12-30",
    status: "active",
  },
  {
    id: "cust_4",
    name: "Emma Wilson",
    email: "emma.w@outlook.com",
    phone: "(212) 555-1234",
    totalSpent: 45.0,
    visitCount: 1,
    lastVisit: "2024-11-15",
    status: "inactive",
  },
  {
    id: "cust_5",
    name: "David Miller",
    email: "dmiller@gmail.com",
    phone: "(312) 555-5678",
    totalSpent: 350.25,
    visitCount: 4,
    lastVisit: "2024-12-10",
    status: "active",
  },
];

export function useCustomers() {
  const [data, setData] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate API delay
    const timer = setTimeout(() => {
      setData(MOCK_CUSTOMERS);
      setIsLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  return {
    data,
    isLoading,
  };
}
