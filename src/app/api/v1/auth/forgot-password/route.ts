import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { extractClientIp } from "@/modules/auth/rate-limit";
import { RateLimitError, requestPasswordReset } from "@/modules/auth/password-recovery";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Pedido inválido." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Indique um email válido." },
      { status: 400 },
    );
  }

  try {
    const result = await requestPasswordReset(
      prisma,
      parsed.data.email,
      extractClientIp(request),
    );
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : "Falha ao enviar email de recuperação";
    return NextResponse.json({ message }, { status: 502 });
  }
}
