/**
 * Email templates. Ported from apps/app/src/lib/email/templates.ts. The brand
 * constants below are duplicated from packages/design/src/brand.ts (the API does
 * NOT import @flagon/design — it would pull React peers into the Hono bundle;
 * this follows the same convention as apps/api/src/lib/brand-mark.ts). Keep the
 * values in sync with brand.ts.
 */

type Template = { subject: string; html: string };

const name = "Flagon";
const url = "https://www.flagon.io";
const colors = {
  bg: "#09090b",
  surface: "#0b0f10",
  text: "#fafafa",
  muted: "#a1a1aa",
  accent: "#14b8a6",
  accentBright: "#2dd4bf",
  accentDeep: "#0d9488",
};

function layout(opts: {
  heading: string;
  intro: string;
  cta?: { label: string; href: string };
  outro?: string;
  footnote?: string;
}): string {
  const { heading, intro, cta, outro, footnote } = opts;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${colors.bg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg};padding:40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:${colors.surface};border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <a href="${url}" style="text-decoration:none;color:${colors.accentBright};font:600 18px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${name}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;">
                <h1 style="margin:0 0 12px;color:${colors.text};font:600 22px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${heading}</h1>
                <p style="margin:0 0 20px;color:${colors.muted};font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${intro}</p>
                ${
                  cta
                    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${colors.accent};">
                        <a href="${cta.href}" style="display:inline-block;padding:11px 20px;color:#08110f;font:600 14px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;text-decoration:none;">${cta.label}</a>
                      </td></tr></table>`
                    : ""
                }
                ${
                  cta
                    ? `<p style="margin:20px 0 0;color:${colors.muted};font:400 13px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">Or paste this link into your browser:<br><a href="${cta.href}" style="color:${colors.accentBright};word-break:break-all;">${cta.href}</a></p>`
                    : ""
                }
                ${
                  outro
                    ? `<p style="margin:20px 0 0;color:${colors.muted};font:400 13px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${outro}</p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 32px;">
                <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 16px;">
                <p style="margin:0;color:#71717a;font:400 12px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                  ${footnote ?? `You are receiving this because someone used your address on ${name}. If it was not you, you can ignore this email.`}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function verifyEmailTemplate(verifyUrl: string): Template {
  return {
    subject: `Verify your ${name} email`,
    html: layout({
      heading: "Confirm your email",
      intro: `Welcome to ${name}. Confirm this is your email address to finish setting up your account and unlock everything.`,
      cta: { label: "Verify email", href: verifyUrl },
      footnote: `If you did not create a ${name} account, you can safely ignore this email.`,
    }),
  };
}

export function resetPasswordTemplate(resetUrl: string): Template {
  return {
    subject: `Reset your ${name} password`,
    html: layout({
      heading: "Reset your password",
      intro:
        "We received a request to reset your password. Choose a new one with the button below. This link expires in one hour.",
      cta: { label: "Reset password", href: resetUrl },
      footnote: `If you did not request this, your password is unchanged and you can ignore this email.`,
    }),
  };
}

export function changeEmailTemplate(verifyUrl: string): Template {
  return {
    subject: `Confirm your new ${name} email`,
    html: layout({
      heading: "Confirm your new email",
      intro:
        "Confirm you want to add this address to your account. Once verified you can make it your primary email.",
      cta: { label: "Confirm email", href: verifyUrl },
    }),
  };
}

export function usageThresholdTemplate(opts: {
  organizationName: string;
  threshold: number; // 80 or 100
  usedEvents: number;
  includedEvents: number;
  usageUrl: string;
}): Template {
  const { organizationName, threshold, usedEvents, includedEvents, usageUrl } = opts;
  const atCap = threshold >= 100;
  const fmt = (n: number) => n.toLocaleString("en-US");
  return {
    subject: atCap
      ? `${organizationName} has used all its included events this month`
      : `${organizationName} is at ${threshold}% of its included events`,
    html: layout({
      heading: atCap
        ? "You've used all your included events"
        : `You're at ${threshold}% of your included events`,
      // Warn-first: nothing is blocked today, so the copy is a heads-up, not a
      // shutoff notice. Flag evaluation is always free and unaffected either way.
      intro: atCap
        ? `${organizationName} has used all ${fmt(includedEvents)} events included in your plan this month. Nothing is blocked and your flags keep serving, but to raise your limit, upgrade to Pro.`
        : `${organizationName} has used ${fmt(usedEvents)} of its ${fmt(includedEvents)} included events this month (${threshold}%). Upgrade to Pro to raise your limit before you reach it.`,
      cta: { label: "See usage", href: usageUrl },
      footnote: `You are receiving this because you manage ${organizationName} on ${name}.`,
    }),
  };
}

export function incidentTemplate(opts: {
  organizationName: string;
  number: number;
  title: string;
  severity: string;
  status: string;
  kind: "declared" | "escalated" | "update";
  incidentUrl: string;
}): Template {
  const { organizationName, number, title, severity, status, kind, incidentUrl } = opts;
  const label = `INC-${number}`;
  const verb = kind === "escalated" ? "escalated to you" : kind === "update" ? "updated" : "declared";
  return {
    subject: `[${severity.toUpperCase()}] ${label}: ${title}`,
    html: layout({
      heading: `${label} ${verb}`,
      intro: `An incident on ${organizationName} was ${verb}: "${title}" (${severity}, ${status}). Acknowledge it to stop escalation and take point.`,
      cta: { label: "View incident", href: incidentUrl },
      footnote: `You are receiving this because you are on-call or on the responding team for ${organizationName}.`,
    }),
  };
}

export function invitationTemplate(opts: {
  organizationName: string;
  inviterName: string;
  acceptUrl: string;
}): Template {
  const { organizationName, inviterName, acceptUrl } = opts;
  return {
    subject: `${inviterName} invited you to ${organizationName} on ${name}`,
    html: layout({
      heading: `Join ${organizationName}`,
      intro: `${inviterName} invited you to collaborate on ${organizationName} in ${name}. Accept the invitation to get started.`,
      cta: { label: "Accept invitation", href: acceptUrl },
      footnote: `If you were not expecting this invitation, you can ignore this email.`,
    }),
  };
}
