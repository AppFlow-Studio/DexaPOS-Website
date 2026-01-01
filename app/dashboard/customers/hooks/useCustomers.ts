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
  // New detailed fields
  averageTip: number; // percentage
  mostOrderedItems: { name: string; count: number }[];
  lastOrderDate: string; // e.g. "2 days ago"
  orderChannels: { name: string; value: number; color: string }[];
  birthday?: string;
  lifetimeSpend?: number; // can be same as totalSpent
}

const MOCK_CUSTOMERS: Customer[] = [
  {
    id: "cust_1",
    name: "Samir Kadi",
    email: "skadi18@yahoo.com",
    phone: "+1 917-929-3036",
    totalSpent: 1245.5,
    lifetimeSpend: 1245.5,
    visitCount: 12,
    lastVisit: "8 Sep 2025",
    status: "active",
    averageTip: 20,
    lastOrderDate: "2 days ago",
    birthday: "12 Aug",
    mostOrderedItems: [
      { name: "Biscoff Crepe { Lotus }", count: 1 },
      { name: "Blue Rasberry Mojito", count: 1 },
      { name: "Vanilla Milk Shake", count: 3 },
    ],
    orderChannels: [
      { name: "Pickup", value: 100, color: "#3b82f6" }, // blue
      { name: "Dine-in", value: 0, color: "#eab308" }, // yellow
      { name: "Delivery", value: 0, color: "#ec4899" }, // pink
    ],
  },
  {
    id: "cust_2",
    name: "Sarah Jenkins",
    email: "sarah.j@gmail.com",
    phone: "(555) 123-4567",
    totalSpent: 850.75,
    lifetimeSpend: 850.75,
    visitCount: 8,
    lastVisit: "25 Dec 2024",
    status: "active",
    averageTip: 15,
    lastOrderDate: "1 week ago",
    mostOrderedItems: [
      { name: "Latte", count: 5 },
      { name: "Croissant", count: 3 },
    ],
    orderChannels: [
      { name: "Pickup", value: 60, color: "#3b82f6" },
      { name: "Dine-in", value: 20, color: "#eab308" },
      { name: "Delivery", value: 20, color: "#ec4899" },
    ],
  },
  {
    id: "cust_3",
    name: "Michael Chen",
    email: "mchen@tech.co",
    phone: "(415) 555-9876",
    totalSpent: 2100.0,
    lifetimeSpend: 2100.0,
    visitCount: 25,
    lastVisit: "30 Dec 2024",
    status: "active",
    averageTip: 18,
    lastOrderDate: "Yesterday",
    mostOrderedItems: [
      { name: "Espresso", count: 12 },
      { name: "Bagel", count: 8 },
    ],
    orderChannels: [
      { name: "Pickup", value: 40, color: "#3b82f6" },
      { name: "Dine-in", value: 50, color: "#eab308" },
      { name: "Delivery", value: 10, color: "#ec4899" },
    ],
  },
  {
    id: "cust_4",
    name: "Emma Wilson",
    email: "emma.w@outlook.com",
    phone: "(212) 555-1234",
    totalSpent: 45.0,
    lifetimeSpend: 45.0,
    visitCount: 1,
    lastVisit: "15 Nov 2024",
    status: "inactive",
    averageTip: 0,
    lastOrderDate: "1 month ago",
    mostOrderedItems: [{ name: "Iced Tea", count: 1 }],
    orderChannels: [
      { name: "Pickup", value: 100, color: "#3b82f6" },
      { name: "Dine-in", value: 0, color: "#eab308" },
      { name: "Delivery", value: 0, color: "#ec4899" },
    ],
  },
  {
    id: "cust_5",
    name: "David Miller",
    email: "dmiller@gmail.com",
    phone: "(312) 555-5678",
    totalSpent: 350.25,
    lifetimeSpend: 350.25,
    visitCount: 4,
    lastVisit: "10 Dec 2024",
    status: "active",
    averageTip: 22,
    lastOrderDate: "3 weeks ago",
    mostOrderedItems: [
      { name: "Cappuccino", count: 2 },
      { name: "Muffin", count: 4 },
    ],
    orderChannels: [
      { name: "Pickup", value: 30, color: "#3b82f6" },
      { name: "Dine-in", value: 30, color: "#eab308" },
      { name: "Delivery", value: 40, color: "#ec4899" },
    ],
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
