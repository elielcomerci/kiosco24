"use client";

export function FeatureCard({ emoji, title, desc }: { emoji: string, title: string, desc: string }) {
  return (
    <div className="card" style={{ 
      padding: "32px", 
      background: "rgba(255,255,255,0.03)", 
      border: "1px solid rgba(255,255,255,0.1)",
      transition: "transform 0.2s",
      cursor: "default"
    }}
    onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-5px)")}
    onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    >
      <div style={{ fontSize: "32px", marginBottom: "16px" }}>{emoji}</div>
      <h3 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>{title}</h3>
      <p style={{ fontSize: "15px", color: "var(--text-2)", lineHeight: 1.5 }}>{desc}</p>
    </div>
  );
}
