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

interface PartnerRevenueChartProps {
  data: ChartData[];
  color?: string;
  height?: number;
}

export default function PartnerRevenueChart({
  data,
  color = "#f5a623",
  height = 200,
}: PartnerRevenueChartProps) {
  return (
    <div className="chart-card">
      <div className="chart-title">Evolución de Ingresos Pasivos</div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`gradientVal-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: "var(--bg)", 
                border: "1px solid var(--border)", 
                borderRadius: "12px",
                boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
                color: "var(--text)"
              }}
              formatter={(value: any) => {
                if (typeof value !== 'number') return [value, "MRR"];
                return [`$${value.toLocaleString("es-AR")}`, "MRR"];
              }}
              itemStyle={{ color: "var(--text)", fontWeight: 700 }}
              cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={3}
              fillOpacity={1}
              fill={`url(#gradientVal-${color})`}
              isAnimationActive={true}
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <style jsx>{`
        .chart-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 24px;
        }

        .chart-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-2);
          margin-bottom: 24px;
        }
      `}</style>
    </div>
  );
}
