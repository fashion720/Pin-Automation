import { NextRequest, NextResponse } from "next/server";
import { scrapeArticle } from "@/lib/scrape";
import { requireApiSecret } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const { articleUrl } = await req.json();
    if (!articleUrl) {
      return NextResponse.json({ error: "articleUrl is required" }, { status: 400 });
    }

    const article = await scrapeArticle(articleUrl);

    if (article.images.length === 0) {
      return NextResponse.json(
        { error: "Is article mein koi image nahi mili. Link check karo." },
        { status: 422 }
      );
    }

    return NextResponse.json(article);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Scrape failed" }, { status: 500 });
  }
}
