"use client";

interface NumPadProps {
  value: string;
  onChange: (value: string) => void;
}

export default function NumPad({ value, onChange }: NumPadProps) {
  const handle = (key: string) => {
    if (key === "⌫") {
      onChange(value.slice(0, -1));
    } else if (key === "000") {
      onChange(value + "000");
    } else {
      // Don't add more digits than needed
      const next = value + key;
      if (next.length <= 8) onChange(next);
    }
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "⌫"];

  return (
    <div className="numpad">
      {keys.map((key) => (
        <button
          key={key}
          className="numpad-key"
          onClick={() => handle(key)}
          style={
            key === "⌫"
              ? { color: "var(--red)", fontSize: "20px" }
              : key === "000"
              ? { color: "var(--text-2)", fontSize: "16px" }
              : undefined
          }
        >
          {key}
        </button>
      ))}
    </div>
  );
}
