import { NextRequest, NextResponse } from "next/server";

/**
 * Simple shared-secret guard for internal API routes.
 * Set APP_API_SECRET in your Vercel project's Environment Variables.
 * The frontend must send the same value in the `x-api-secret` header.
 */
export function requireApiSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.APP_API_SECRET;

  if (!expected) {
    // Fail closed: if the secret isn't configured, refuse instead of
    // silently running the route unauthenticated.
    return NextResponse.json(
      { error: "Server misconfigured: APP_API_SECRET is not set" },
      { status: 500 }
    );
  }

  const provided = req.headers.get("x-api-secret");

  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null; // null = authorized, continue
}
