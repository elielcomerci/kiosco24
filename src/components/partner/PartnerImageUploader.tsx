"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { updatePartnerImage } from "@/app/partner/actions";

export default function PartnerImageUploader({ currentImage }: { currentImage: string | null }) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState(currentImage);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert("El tamaño máximo es 8MB.");
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "branding");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Error al subir");
      const data = await res.json();
      
      setPreview(data.url);
      await updatePartnerImage(data.url);
    } catch (err) {
      alert("Hubo un error subiendo la imagen.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="partner-uploader">
      <div className="uploader-header">
        <h4>Personalizar Logo</h4>
      </div>
      <div className="uploader-body">
        <div className="uploader-avatar">
          {preview ? (
            <Image src={preview} alt="Logo" fill className="object-cover" />
          ) : (
            <span className="placeholder">P</span>
          )}
        </div>
        <div className="uploader-actions">
          <input 
            type="file" 
            ref={fileInput} 
            onChange={handleFileChange} 
            accept="image/*" 
            style={{ display: "none" }} 
          />
          <button 
            type="button" 
            className="btn-upload" 
            onClick={() => fileInput.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? "Subiendo..." : "Cambiar logo"}
          </button>
          {preview && !isUploading && (
            <button 
              type="button" 
              className="btn-remove"
              onClick={async () => {
                setPreview(null);
                await updatePartnerImage(null);
              }}
            >
              Remover
            </button>
          )}
        </div>
      </div>
      <style jsx>{`
        .partner-uploader { background: var(--surface); border: 1px solid var(--border); padding: 20px; border-radius: var(--radius-md); margin-bottom: 24px; }
        .uploader-header h4 { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
        .uploader-body { display: flex; align-items: center; gap: 20px; }
        .uploader-avatar { width: 64px; height: 64px; border-radius: 50%; background: var(--border); flex-shrink: 0; position: relative; overflow: hidden; display: grid; place-items: center; border: 2px solid var(--primary); }
        .placeholder { font-size: 24px; font-weight: 800; color: var(--text-3); }
        .uploader-actions { display: flex; flex-direction: column; gap: 8px; }
        .btn-upload { background: var(--text); color: var(--surface); border: none; padding: 6px 12px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 700; cursor: pointer; transition: opacity .2s; }
        .btn-upload:hover { opacity: 0.9; }
        .btn-upload:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-remove { background: transparent; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 10px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 600; cursor: pointer; }
      `}</style>
    </div>
  );
}
