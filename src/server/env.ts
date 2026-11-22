import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url().optional(),
  APP_URL: z.string().url().optional(),
  AGGREGATE_ENCRYPTION_KEY: z.string().min(32).optional(),
  SIGESC_AGGREGATE_MODE: z.enum(["mock", "http"]).default("mock"),
  SIGESC_AGGREGATE_HOST: z.string().url().default("https://app.sisgesc.net"),
  SIGESC_REGISTER_URL: z.string().url().optional(),
  EMAIL_MODE: z.enum(["mock", "smtp"]).default("mock"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),
  SMTP_FROM_NAME: z.string().optional(),
  TEMP_PASSWORD_TTL_HOURS: z.string().optional(),
  PASSWORD_RESET_TTL_MINUTES: z.string().optional(),
  ONBOARDING_CHALLENGE_TTL_MINUTES: z.string().optional(),
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
