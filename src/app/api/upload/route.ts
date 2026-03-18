import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { auth } from "@/lib/auth";
import { guardOperationalAccess } from "@/lib/access-control";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessResponse = await guardOperationalAccess(session.user);
    if (accessResponse) {
      return accessResponse;
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert file to Base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mime = file.type || "image/jpeg";
    const encoding = "base64";
    const base64Data = buffer.toString("base64");
    const fileUri = `data:${mime};${encoding},${base64Data}`;

    // Upload to Cloudinary
    const uploadResponse = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        fileUri,
        {
          folder: "kiosco24_products",
          width: 800,
          crop: "limit", // resize to max 800px width keeping aspect ratio
          quality: "auto",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
    });

    return NextResponse.json(uploadResponse);
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
