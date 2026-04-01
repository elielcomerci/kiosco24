import { formatARS } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
  warning?: boolean;
  trend?: number | null;
}

export default function KpiCard({
  label,
  value,
  sub,
  highlight,
  warning,
  trend,
}: KpiCardProps) {
  return (
    <div
      style={{
        background: highlight
          ? "linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,197,94,0.03))"
          : "var(--surface)",
        border: `1px solid ${highlight ? "rgba(34,197,94,0.25)" : "var(--border)"}`,
        borderRadius: "var(--radius-lg)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-3)",
          }}
        >
          {label}
        </span>
        {trend !== undefined && trend !== null && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: "4px",
              background:
                trend > 0
                  ? "rgba(34,197,94,0.15)"
                  : trend < 0
                  ? "rgba(239,68,68,0.15)"
                  : "var(--surface-2)",
              color:
                trend > 0 ? "var(--green)" : trend < 0 ? "var(--red)" : "var(--text-3)",
              display: "flex",
              alignItems: "center",
              gap: "2px",
            }}
          >
            {trend > 0 ? "↑" : trend < 0 ? "↓" : "−"} {Math.abs(Math.round(trend))}%
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: warning ? "var(--red)" : highlight ? "var(--green)" : "var(--text)",
          lineHeight: 1.1,
        }}
      >
        {typeof value === "number" ? formatARS(value) : value}
      </span>
      {sub && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{sub}</span>}
    </div>
  );
}
