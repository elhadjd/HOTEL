import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTenant } from "@/server/api-auth";
import { importCentralProductsToCatalog } from "@/modules/sigesc-integration/products/products-service";
import { mapAggregateError } from "@/modules/sigesc-integration/connection-context";

const importSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("single"),
    productId: z.union([z.string().min(1), z.number().int().positive()]),
  }),
  z.object({
    mode: z.literal("selected"),
    productIds: z.array(z.union([z.string().min(1), z.number().int().positive()])).min(1).max(200),
  }),
  z.object({
    mode: z.literal("all"),
    kind: z.enum(["all", "product", "service"]).optional(),
    search: z.string().max(120).optional(),
  }),
]);

export async function POST(request: Request) {
  const authz = await requireTenant("integrations.products");
  if (!authz.ok) return authz.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = importSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parâmetros de importação inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await importCentralProductsToCatalog(prisma, authz.ctx, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapAggregateError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
