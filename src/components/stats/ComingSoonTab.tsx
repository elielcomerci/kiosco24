interface ComingSoonTabProps {
  emoji: string;
  label: string;
}

export default function ComingSoonTab({ emoji, label }: ComingSoonTabProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 20px",
        gap: 12,
        color: "var(--text-3)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 40 }}>{emoji}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-2)" }}>
        {label}
      </div>
      <div style={{ fontSize: 13 }}>Este módulo está en camino</div>
    </div>
  );
}
