interface EmptyStateProps {
  emoji: string;
  title: string;
  description?: string;
}

export default function EmptyState({ emoji, title, description }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        gap: 12,
        color: "var(--text-3)",
        textAlign: "center",
        fontSize: 15,
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>{emoji}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-2)" }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: 13 }}>{description}</div>
      )}
    </div>
  );
}
