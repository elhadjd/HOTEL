import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { RateLimitError, requestPasswordReset } from "@/modules/auth/password-recovery";

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
    return NextResponse.json(
      { message: "Pedido inválido.", found: false },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Indique um email válido.", found: false },
      { status: 400 },
    );
  }

  try {
    const result = await requestPasswordReset(prisma, parsed.data.email, clientIp(request));
    return NextResponse.json(result, { status: result.found ? 200 : 404 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : "Falha ao enviar email de recuperação";
    return NextResponse.json({ message, found: false }, { status: 502 });
  }
}
