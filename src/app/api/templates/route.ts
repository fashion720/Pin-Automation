import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { TEMPLATES } from "@/lib/templates";
import { addCustomTemplate, getCustomTemplates } from "@/lib/templateStore";
import { ensurePlaceholderTemplates } from "@/lib/ensurePlaceholderTemplates";

export async function GET() {
  await ensurePlaceholderTemplates();
  const builtIn = TEMPLATES.map((template) => ({ ...template, isCustom: false }));

  // Built-in designs are usable without custom-template storage. If R2 is not
  // configured yet, keep the URL-only generation flow available and simply
  // omit user-uploaded templates from this response.
  try {
    const custom = (await getCustomTemplates()).map((template) => ({ ...template, isCustom: true }));
    return NextResponse.json([...builtIn, ...custom]);
  } catch {
    return NextResponse.json(builtIn);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, backgroundFile, width, height, imageSlots, textSlot } = body;

    if (!backgroundFile) {
      return NextResponse.json({ error: "Template image chahiye" }, { status: 400 });
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: "Template ka naam do" }, { status: 400 });
    }
    if (!Array.isArray(imageSlots) || imageSlots.length === 0) {
      return NextResponse.json({ error: "Kam se kam ek image slot draw karo" }, { status: 400 });
    }

    const template = await addCustomTemplate({
      id: `custom-${randomUUID()}`,
      name,
      imageCount: imageSlots.length,
      width: width || 1000,
      height: height || 1500,
      backgroundFile,
      imageSlots,
      textSlot: textSlot || {
        x: 0,
        y: (height || 1500) - 150,
        w: width || 1000,
        h: 150,
        fontSize: 60,
        color: "#ffffff",
        align: "center",
      },
    });

    return NextResponse.json(template);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
