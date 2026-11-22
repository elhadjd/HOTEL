import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url().optional(),
  AGGREGATE_ENCRYPTION_KEY: z.string().min(32).optional(),
  SIGESC_AGGREGATE_MODE: z.enum(["mock", "http"]).default("mock"),
  SIGESC_AGGREGATE_HOST: z.string().url().default("https://app.sisgesc.net"),
  SIGESC_REGISTER_URL: z.string().url().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.AGGREGATE_ENCRYPTION_KEY) {
    throw new Error("AGGREGATE_ENCRYPTION_KEY is required in production");
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
