import { brand } from "./brand";

/**
 * Branded transactional email rendering: dark, teal-accented, matching the
 * site. One layout for every message (logo, heading, card, CTA button, muted
 * footnote + footer) so all outbound mail looks like it came from the same
 * product. Returns both HTML and a plain-text alternative; callers hand the
 * pair to sendEmail.
 *
 * Email-client constraints shape the markup: tables + fully inline styles
 * (no stylesheets), bgcolor attributes as a fallback, and a hosted PNG logo
 * (clients don't render SVG). The logo is served from the marketing site, so
 * it resolves in recipients' inboxes regardless of where the app runs.
 */
export type BrandedEmailInput = {
  /** Hidden preheader shown next to the subject in inbox list views. */
  preview?: string;
  heading: string;
  /** Plain-text paragraphs rendered above the CTA. HTML is escaped. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Muted small print inside the card, e.g. expiry + "safe to ignore". */
  footnote?: string;
};

const c = {
  bg: "#09090b",
  card: "#111113",
  border: "#26262b",
  heading: "#fafafa",
  body: "#a1a1aa",
  muted: "#71717a",
  footer: "#52525b",
  accent: "#14b8a6",
  accentText: "#09090b",
  link: "#2dd4bf",
} as const;

const font =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderBrandedEmail(input: BrandedEmailInput): {
  html: string;
  text: string;
} {
  const { preview, heading, paragraphs, cta, footnote } = input;
  const logoUrl = `${brand.url}/email/flagon-mark.png`;

  const paragraphsHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:14px;line-height:22px;color:${c.body};">${escapeHtml(p)}</p>`,
    )
    .join("\n");

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
        <tr>
          <td bgcolor="${c.accent}" style="border-radius:6px;">
            <a href="${escapeHtml(cta.url)}" target="_blank" style="display:inline-block;padding:10px 24px;font-family:${font};font-size:14px;font-weight:600;color:${c.accentText};text-decoration:none;border-radius:6px;">${escapeHtml(cta.label)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:12px;line-height:20px;color:${c.muted};">or copy and paste this URL into your browser:<br/><a href="${escapeHtml(cta.url)}" target="_blank" style="color:${c.link};text-decoration:none;word-break:break-all;">${escapeHtml(cta.url)}</a></p>`
    : "";

  const footnoteHtml = footnote
    ? `<hr style="border:none;border-top:1px solid ${c.border};margin:20px 0 16px;"/>
      <p style="margin:0;font-size:12px;line-height:20px;color:${c.muted};">${escapeHtml(footnote)}</p>`
    : "";

  const previewHtml = preview
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preview)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<meta name="supported-color-schemes" content="dark"/>
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${c.bg};" bgcolor="${c.bg}">
${previewHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.bg}" style="background-color:${c.bg};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="440" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;width:100%;">
        <tr>
          <td align="center" style="padding-bottom:20px;">
            <img src="${logoUrl}" width="48" height="48" alt="${brand.name}" style="display:block;border:0;"/>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:20px;font-family:${font};font-size:20px;font-weight:600;color:${c.heading};">${escapeHtml(heading)}</td>
        </tr>
        <tr>
          <td bgcolor="${c.card}" style="background-color:${c.card};border:1px solid ${c.border};border-radius:8px;padding:24px;font-family:${font};">
            ${paragraphsHtml}
            ${ctaHtml}
            ${footnoteHtml}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:24px;font-family:${font};font-size:12px;line-height:20px;color:${c.footer};">
            ${brand.name} &middot; ${escapeHtml(brand.taglineLead)} ${escapeHtml(brand.taglineFollow)}<br/>
            <a href="${brand.url}" target="_blank" style="color:${c.footer};text-decoration:underline;">${brand.domain}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    heading,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    ...(cta ? [`${cta.label}: ${cta.url}`, ""] : []),
    ...(footnote ? [footnote, ""] : []),
    `${brand.name} - ${brand.url}`,
  ].join("\n");

  return { html, text };
}
