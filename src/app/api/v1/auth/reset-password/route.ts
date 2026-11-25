import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import {
  enforceRateLimit,
  extractClientIp,
  RateLimitError,
} from "@/modules/auth/rate-limit";
import { resetPasswordWithToken } from "@/modules/auth/password-recovery";

const bodySchema = z.object({
  token: z.string().min(20),
  password: z.string().min(10),
  confirmPassword: z.string().min(10),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reset payload" }, { status: 400 });
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  }

  const ip = extractClientIp(request);
  try {
    await enforceRateLimit({
      bucketKey: `reset:${ip ?? "unknown"}`,
      limit: 10,
      windowMs: 15 * 60_000,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
  }

  try {
    await resetPasswordWithToken(prisma, parsed.data.token, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    const status = message.includes("strength") || message.includes("Password must")
      ? 400
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
