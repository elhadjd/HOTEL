import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "./templates";

describe("email templates", () => {
  it("renders onboarding temp password without leaking into subject oddly", () => {
    const rendered = renderEmailTemplate("ONBOARDING_TEMP_PASSWORD", {
      appUrl: "http://localhost:3000",
      toName: "Sofia",
      institutionName: "Hotel Baía",
      secret: "TmpSecret1!",
    });
    expect(rendered.html).toContain("Sofia");
    expect(rendered.html).toContain("TmpSecret1!");
    expect(rendered.text).toContain("TmpSecret1!");
    expect(rendered.subject).toContain("SIGESC Hotelaria");
  });

  it("builds recovery link from encrypted secret at render time", () => {
    const token = "opaque-reset-token-value";
    const rendered = renderEmailTemplate("PASSWORD_RECOVERY", {
      appUrl: "http://localhost:3000",
      toName: "Sofia",
      resetPath: "/reset-password",
      secret: token,
    });
    expect(rendered.html).toContain(`token=${encodeURIComponent(token)}`);
    expect(rendered.text).toContain(token);
  });

  it("escapes HTML in names", () => {
    const rendered = renderEmailTemplate("PASSWORD_CHANGED", {
      appUrl: "http://localhost:3000",
      toName: '<script>alert(1)</script>',
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });
});
