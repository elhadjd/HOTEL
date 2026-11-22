import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import {
  GENERIC_MESSAGE,
  RateLimitError,
  requestPasswordReset,
} from "@/modules/auth/password-recovery";

const bodySchema = z.object({
  email: z.string().email(),
});

function clientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  }

  const parsed = bodySchema.safeParse(json);
  // Always generic — avoid enumeration via validation differences for known shapes
  if (!parsed.success) {
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  }

  try {
    const result = await requestPasswordReset(prisma, parsed.data.email, clientIp(request));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  }
}
