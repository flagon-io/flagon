import { describe, it, expect } from "vitest";
import { renderBrandedEmail } from "./email-templates";

describe("branded email rendering", () => {
  const input = {
    preview: "Preview line",
    heading: "Reset your password",
    paragraphs: ["Someone requested a reset."],
    cta: { label: "Reset password", url: "https://app.flagon.io/reset?x=1" },
    footnote: "Safe to ignore.",
  };

  it("renders the heading, body, CTA, and footnote into the HTML", () => {
    const { html } = renderBrandedEmail(input);
    expect(html).toContain("Reset your password");
    expect(html).toContain("Someone requested a reset.");
    expect(html).toContain('href="https://app.flagon.io/reset?x=1"');
    expect(html).toContain("Safe to ignore.");
    expect(html).toContain("Preview line");
    expect(html).toContain("/email/flagon-mark.png");
  });

  it("mirrors the content in the plain-text alternative", () => {
    const { text } = renderBrandedEmail(input);
    expect(text).toContain("Reset your password");
    expect(text).toContain("Reset password: https://app.flagon.io/reset?x=1");
    expect(text).toContain("Safe to ignore.");
    expect(text).not.toContain("<");
  });

  it("escapes HTML in user-influenced content", () => {
    const { html } = renderBrandedEmail({
      heading: "Hi <script>alert(1)</script>",
      paragraphs: ['Quote " and <tag>'],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
  });
});
