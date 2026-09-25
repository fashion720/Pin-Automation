import { NextRequest, NextResponse } from "next/server";
import { getAccounts, upsertAccount, deleteAccount } from "@/lib/accounts";

export async function GET() {
  try {
    return NextResponse.json({ accounts: await getAccounts() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const account = await upsertAccount(body);
    return NextResponse.json({ account });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new Error("id chahiye");
    await deleteAccount(id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
