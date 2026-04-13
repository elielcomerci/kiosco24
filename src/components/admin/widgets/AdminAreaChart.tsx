"use client";

import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

type ChartData = {
  name: string;
  value: number;
};

interface AdminAreaChartProps {
  data: ChartData[];
  color?: string;
  height?: number;
}

export default function AdminAreaChart({
  data,
  color = "#22c55e",
  height = 60,
}: AdminAreaChartProps) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`colorValue-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip 
            contentStyle={{ 
              backgroundColor: "#161616", 
              border: "1px solid #2a2a2a", 
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              color: "#f0ede8"
            }}
            itemStyle={{ color: "#f0ede8" }}
            cursor={{ stroke: "#2a2a2a", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#colorValue-${color})`}
            isAnimationActive={true}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
