import { formatARS } from "@/lib/utils";

interface BarChartProps {
  data: Record<string, number | string>[];
  valueKey: string;
  labelKey: string;
  color?: string;
}

export default function BarChart({
  data,
  valueKey,
  labelKey,
  color = "var(--primary)",
}: BarChartProps) {
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80, padding: "0 4px" }}>
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const height = Math.max((val / max) * 72, val > 0 ? 4 : 0);
        const label = String(d[labelKey]);
        return (
          <div
            key={i}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
          >
            <div
              title={`${label}: ${formatARS(val)}`}
              style={{
                width: "100%",
                height,
                background: val > 0 ? color : "var(--border)",
                borderRadius: "3px 3px 0 0",
                transition: "height 0.3s ease",
              }}
            />
            <span
              style={{
                fontSize: 9,
                color: "var(--text-3)",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
