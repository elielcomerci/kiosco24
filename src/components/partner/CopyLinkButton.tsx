"use client";

import React, { useState } from "react";

export default function CopyLinkButton({ referralLink }: { referralLink: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`flex-1 font-bold py-4 rounded-xl transition-all ${
        copied 
          ? "bg-[#22d98a]/20 text-[#22d98a] border border-[#22d98a]/30" 
          : "bg-white text-black hover:bg-white/90"
      }`}
    >
      {copied ? "¡Copiado al portapapeles!" : "Copiar Link"}
    </button>
  );
}
