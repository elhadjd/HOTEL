import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "@/server/logger";

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface Mailer {
  send(input: SendMailInput): Promise<{ messageId: string }>;
}

class MockMailer implements Mailer {
  public readonly sent: SendMailInput[] = [];
  /** Full text bodies for test assertions only — never logged */
  public readonly sentTexts: string[] = [];

  async send(input: SendMailInput) {
    this.sent.push({
      to: input.to,
      subject: input.subject,
      html: "[redacted-html]",
      text: "[redacted-text]",
    });
    this.sentTexts.push(input.text);
    logger.info("email.mock.sent", { to: input.to, subject: input.subject });
    return { messageId: `mock-${Date.now()}` };
  }
}

class SmtpMailer implements Mailer {
  private transporter: Transporter;
  private from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? "587");
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const fromEmail = process.env.SMTP_FROM_EMAIL;
    const fromName = process.env.SMTP_FROM_NAME ?? "SIGESC Hotelaria";

    if (!host || !fromEmail) {
      throw new Error("SMTP_HOST and SMTP_FROM_EMAIL are required when EMAIL_MODE=smtp");
    }

    this.from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async send(input: SendMailInput) {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { messageId: String(info.messageId ?? "smtp") };
  }
}

let singleton: Mailer | null = null;
let mockSingleton: MockMailer | null = null;

export function resolveEmailMode(): "mock" | "smtp" {
  const mode = (process.env.EMAIL_MODE ?? "mock").toLowerCase();
  return mode === "smtp" ? "smtp" : "mock";
}

export function getMailer(): Mailer {
  if (singleton) return singleton;
  if (resolveEmailMode() === "smtp") {
    singleton = new SmtpMailer();
  } else {
    mockSingleton = new MockMailer();
    singleton = mockSingleton;
  }
  return singleton;
}

export function getMockMailer(): MockMailer | null {
  return mockSingleton;
}

export function resetMailer(): void {
  singleton = null;
  mockSingleton = null;
}

export function getAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
