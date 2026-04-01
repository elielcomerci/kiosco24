import { formatARS } from "@/lib/utils";

interface MetodoBarProps {
  label: string;
  amount: number;
  total: number;
}

export default function MetodoBar({ label, amount, total }: MetodoBarProps) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span style={{ color: "var(--text-2)" }}>{label}</span>
        <span style={{ fontWeight: 600 }}>
          {formatARS(amount)}
          <span style={{ color: "var(--text-3)", fontWeight: 400, marginLeft: 6 }}>{pct}%</span>
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "var(--surface-2)",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--primary)",
            borderRadius: 99,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}
