"use client";

export default function ProductThumb({
  image,
  emoji,
  name,
  size = 44,
  radius = 12,
  fontSize,
}: {
  image?: string | null;
  emoji?: string | null;
  name: string;
  size?: number;
  radius?: number;
  fontSize?: number;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: `${radius}px`,
          objectFit: "cover",
          flexShrink: 0,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      />
    );
  }

  if (emoji) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: `${radius}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          fontSize: `${fontSize ?? Math.max(18, Math.round(size * 0.52))}px`,
          lineHeight: 1,
        }}
      >
        {emoji}
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${radius}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        color: "var(--text-3)",
        fontSize: `${fontSize ?? Math.max(14, Math.round(size * 0.34))}px`,
        fontWeight: 700,
        textTransform: "uppercase",
      }}
    >
      {name.slice(0, 1)}
    </div>
  );
}
