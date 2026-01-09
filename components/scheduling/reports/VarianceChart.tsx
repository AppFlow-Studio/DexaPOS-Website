"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface VarianceChartProps {
  data: {
    day: string;
    sales: number;
    labor: number;
  }[];
}

export function VarianceChart({ data }: VarianceChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
        <XAxis
          dataKey="day"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            borderColor: "hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelStyle={{ color: "hsl(var(--popover-foreground))" }}
          formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
        />
        <Legend
          iconType="square"
          wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
        />
        <Bar
          dataKey="sales"
          name="Sales Revenue"
          fill="hsl(var(--primary) / 0.3)"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="labor"
          name="Labor Cost"
          fill="hsl(var(--primary))"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default VarianceChart;
