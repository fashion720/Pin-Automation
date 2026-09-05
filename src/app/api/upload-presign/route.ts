import { NextRequest, NextResponse } from "next/server";
import { getPresignedUploadUrl } from "@/lib/storage";

/**
 * Body: { prefix: "templates" | "pins-manual", contentType: "image/png" | "image/jpeg" }
 * Returns: { uploadUrl, publicUrl, key }
 *
 * The browser PUTs the raw file straight to `uploadUrl` (an R2 signed URL),
 * then tells our server about the result via `publicUrl` — the file bytes
 * never pass through our Next.js server, so there's no size limit issue.
 */
export async function POST(req: NextRequest) {
  try {
    const { prefix, contentType } = await req.json();

    if (!prefix || !contentType) {
      return NextResponse.json(
        { error: "prefix aur contentType chahiye" },
        { status: 400 }
      );
    }
    if (!["image/png", "image/jpeg"].includes(contentType)) {
      return NextResponse.json({ error: "Sirf PNG/JPG allowed hai" }, { status: 400 });
    }

    const result = await getPresignedUploadUrl(prefix, contentType);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Presign failed" }, { status: 500 });
  }
}
