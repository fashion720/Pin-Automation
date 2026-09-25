import { NextRequest, NextResponse } from "next/server";
import { selectPins } from "@/lib/pinSelection";
import { getAccount } from "@/lib/accounts";
import { buildPlan } from "@/lib/pinterestAutoPlan";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, pinsPerDay, startAt, timeZone, batchId, postIds, pinIds } = body;
    if (!accountId) throw new Error("Pinterest account select karo");
    const account = await getAccount(accountId);
    if (!account) throw new Error("Account nahi mila");

    const selected = await selectPins({ batchId, postIds, pinIds });
    const plan = await buildPlan(selected, account, {
      pinsPerDay: Math.max(1, Math.min(50, Math.round(pinsPerDay || 6))),
      startAt: startAt || new Date().toISOString(),
      timeZone: timeZone || "UTC",
    });

    return NextResponse.json({ plan, accountId, accountName: account.name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Plan banane mein masla hua";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
