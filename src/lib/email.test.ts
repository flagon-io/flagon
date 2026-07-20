import { describe, it, expect, vi, afterEach } from "vitest";
import {
  consoleProvider,
  isEmailConfigured,
  resolveEmailProvider,
  resolveFrom,
} from "./email";

describe("email provider resolution", () => {
  it("selects Resend when RESEND_API_KEY is set", () => {
    const provider = resolveEmailProvider({ RESEND_API_KEY: "re_test" });
    expect(provider.id).toBe("resend");
    expect(isEmailConfigured({ RESEND_API_KEY: "re_test" })).toBe(true);
  });

  it("falls back to the console provider when nothing is configured", () => {
    const provider = resolveEmailProvider({});
    expect(provider.id).toBe("console");
    expect(isEmailConfigured({})).toBe(false);
  });

  it("defaults the from address to the brand domain, overridable via EMAIL_FROM", () => {
    expect(resolveFrom({})).toBe("Flagon <noreply@flagon.io>");
    expect(resolveFrom({ EMAIL_FROM: "Me <me@example.com>" })).toBe(
      "Me <me@example.com>",
    );
  });
});

describe("console provider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prints the message instead of sending", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await consoleProvider().send({
      to: "user@example.com",
      subject: "Reset your password",
      text: "line one\nline two",
    });
    const output = warn.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("NOT configured");
    expect(output).toContain("user@example.com");
    expect(output).toContain("Reset your password");
    expect(output).toContain("line two");
  });
});
