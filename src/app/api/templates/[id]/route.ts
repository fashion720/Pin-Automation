import { NextRequest, NextResponse } from "next/server";
import { deleteCustomTemplate, getCustomTemplate } from "@/lib/templateStore";
import { deleteByPublicUrl } from "@/lib/storage";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const template = await getCustomTemplate(id);
  if (template) {
    try {
      await deleteByPublicUrl(template.backgroundFile);
    } catch {
      // Non-fatal — still remove it from the list even if the R2 delete failed.
    }
  }
  await deleteCustomTemplate(id);
  return NextResponse.json({ ok: true });
}
