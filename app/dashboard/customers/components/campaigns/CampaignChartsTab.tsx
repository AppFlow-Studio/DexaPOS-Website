"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { Database } from "@/database.types";

type Campaign = Database["public"]["Tables"]["marketing_campaigns"]["Row"];

interface CampaignChartsTabProps {
  campaign: Campaign;
}

export function CampaignChartsTab({ campaign }: CampaignChartsTabProps) {
  const stats = {
    totalRecipients: campaign.total_recipients || 0,
    delivered: campaign.total_delivered || 0,
    bounced: campaign.total_bounced || 0,
    opened: campaign.total_opened || 0,
    clicked: campaign.total_clicked || 0,
  };

  // Status distribution for pie chart
  const statusData = [
    { name: "Delivered", value: stats.delivered, color: "#10b981" },
    { name: "Bounced", value: stats.bounced, color: "#ef4444" },
    {
      name: "Pending",
      value: stats.totalRecipients - stats.delivered - stats.bounced,
      color: "#f59e0b",
    },
  ].filter((item) => item.value > 0);

  // Performance data for bar chart
  const performanceData = [
    { name: "Delivered", value: stats.delivered },
    { name: "Opened", value: stats.opened },
    { name: "Clicked", value: stats.clicked },
  ];

  return (
    <div className="space-y-6">
      {/* Delivery Status Chart */}
      {statusData.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold">Delivery Status</h3>
          <Card className="border-none shadow-sm">
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Performance Metrics Chart */}
      {performanceData.some((item) => item.value > 0) && (
        <div className="space-y-4">
          <h3 className="font-semibold">Performance Metrics</h3>
          <Card className="border-none shadow-sm">
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
