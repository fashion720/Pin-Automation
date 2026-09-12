import { NextResponse } from "next/server";
import { getAllPosts } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await getAllPosts());
}
