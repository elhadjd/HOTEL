import type { AggregateConnection, PrismaClient } from "@prisma/client";
import { decryptAggregateKey } from "./crypto";
import { AggregateApiError } from "./types";

export type AggregateScope = "customers" | "products" | "sales" | "users" | "onboarding";

export type ResolvedAggregateConnection = {
  connection: AggregateConnection;
  apiKey: string;
  companyId: string;
  companyNumericId: number;
  scopes: string[];
};

export class AggregateConnectionError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "AggregateConnectionError";
  }
}

export async function resolveInstitutionAggregateConnection(
  prisma: PrismaClient,
  institutionId: string,
): Promise<ResolvedAggregateConnection> {
  const connection = await prisma.aggregateConnection.findUnique({
    where: { institutionId },
  });
  if (!connection) {
    throw new AggregateConnectionError(
      "No Aggregate connection for this institution. Complete SIGESC onboarding first.",
      400,
    );
  }
  if (connection.status !== "ACTIVE") {
    throw new AggregateConnectionError(
      `Aggregate connection is ${connection.status}. Reconnect before using central APIs.`,
      400,
    );
  }
  if (!connection.ownerCompanyExternalId) {
    throw new AggregateConnectionError(
      "Aggregate connection is missing the linked company identity.",
      400,
    );
  }

  let apiKey: string;
  try {
    apiKey = decryptAggregateKey(connection.encryptedApiKey);
  } catch {
    throw new AggregateConnectionError("Failed to unlock Aggregate credentials", 500);
  }

  const scopes = Array.isArray(connection.scopesJson)
    ? (connection.scopesJson as string[])
    : [];

  return {
    connection,
    apiKey,
    companyId: connection.ownerCompanyExternalId,
    companyNumericId: Number(connection.ownerCompanyExternalId),
    scopes,
  };
}

export function assertAggregateScope(
  resolved: ResolvedAggregateConnection,
  need: AggregateScope,
): void {
  const scopes = resolved.scopes.map((s) => s.toLowerCase());
  if (scopes.includes("all") || scopes.includes(need)) return;
  throw new AggregateConnectionError(
    `Aggregate key lacks required scope: ${need}`,
    403,
  );
}

export function assertCompanyMatchesConnection(
  resolved: ResolvedAggregateConnection,
  companyId: number | string,
): void {
  if (String(companyId) !== String(resolved.companyId)) {
    throw new AggregateConnectionError(
      "company_id does not match the connected SIGESC company for this institution",
      403,
    );
  }
}

export function mapAggregateError(err: unknown): { status: number; message: string } {
  if (err instanceof AggregateConnectionError) {
    return { status: err.status, message: err.message };
  }
  if (err instanceof AggregateApiError) {
    const status = [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504].includes(err.status)
      ? err.status
      : 502;
    return { status, message: err.message };
  }
  if (err instanceof Error) {
    const msg = err.message;
    if (/not found/i.test(msg)) return { status: 404, message: msg };
    if (/already linked|conflict|concurrent/i.test(msg)) return { status: 409, message: msg };
    if (/required|invalid|must|only cotação|authorize|mapping|quantity/i.test(msg)) {
      return { status: 400, message: msg };
    }
    return { status: 500, message: msg };
  }
  return { status: 500, message: "Aggregate operation failed" };
}
