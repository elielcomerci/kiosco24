"use client";

type OptimizeImageOptions = {
  maxDimension: number;
  quality?: number;
};

function loadImageDimensions(file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer la imagen."));
    };

    image.src = objectUrl;
  });
}

function resolveOutputType(file: File) {
  if (file.type === "image/png" || file.type === "image/webp") {
    return file.type;
  }
  return "image/jpeg";
}

function ensureExtension(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

async function canvasToFile(canvas: HTMLCanvasElement, file: File, quality: number) {
  const outputType = resolveOutputType(file);
  const extension = ensureExtension(outputType);
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((nextBlob) => resolve(nextBlob), outputType, quality);
  });

  if (!blob) {
    throw new Error("No se pudo optimizar la imagen.");
  }

  return new File([blob], `${baseName}.${extension}`, {
    type: outputType,
    lastModified: Date.now(),
  });
}

export async function optimizeImageForUpload(file: File, options: OptimizeImageOptions) {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const { image, objectUrl } = await loadImageDimensions(file);

  try {
    const longestSide = Math.max(image.width, image.height);
    if (longestSide <= options.maxDimension && file.size <= 1.5 * 1024 * 1024) {
      return file;
    }

    const scale = Math.min(1, options.maxDimension / longestSide);
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    const optimizedFile = await canvasToFile(canvas, file, options.quality ?? 0.82);

    return optimizedFile.size < file.size ? optimizedFile : file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function optimizeProductImage(file: File) {
  return optimizeImageForUpload(file, { maxDimension: 1600, quality: 0.82 });
}

export function optimizeBrandingImage(file: File) {
  return optimizeImageForUpload(file, { maxDimension: 800, quality: 0.9 });
}
