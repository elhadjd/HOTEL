import { describe, expect, it, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { shouldUseSecureAuthCookie } from "./auth-session-token";

describe("shouldUseSecureAuthCookie", () => {
  const prevAuth = process.env.AUTH_URL;
  const prevApp = process.env.APP_URL;

  afterEach(() => {
    if (prevAuth === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = prevAuth;
    if (prevApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevApp;
  });

  it("is true when AUTH_URL is https", () => {
    process.env.AUTH_URL = "https://hotel.sisgesc.net";
    delete process.env.APP_URL;
    const req = new NextRequest("http://127.0.0.1:3000/dashboard");
    expect(shouldUseSecureAuthCookie(req)).toBe(true);
  });

  it("honours x-forwarded-proto", () => {
    delete process.env.AUTH_URL;
    delete process.env.APP_URL;
    const req = new NextRequest("http://127.0.0.1:3000/dashboard", {
      headers: { "x-forwarded-proto": "https", host: "hotel.sisgesc.net" },
    });
    expect(shouldUseSecureAuthCookie(req)).toBe(true);
  });

  it("is false for local http without https hints", () => {
    delete process.env.AUTH_URL;
    delete process.env.APP_URL;
    const req = new NextRequest("http://localhost:3000/login");
    expect(shouldUseSecureAuthCookie(req)).toBe(false);
  });
});
