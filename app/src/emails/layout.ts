// Email templating. Emails are just strings, but they must survive every client
// (inline styles, tables, no external CSS), so we build them from a shared
// branded shell here and specific templates alongside. Keep it beautiful and
// consistent - this is Flagon's voice in someone's inbox.

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Wrap body HTML in the Flagon email shell (header, card, footer, dark mode). */
export function emailLayout(opts: { preview?: string; body: string }): string {
  const preview = opts.preview
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${opts.preview}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  @media (prefers-color-scheme: dark) {
    .bg { background:#000000 !important; }
    .card { background:#0b0b0d !important; border-color:rgba(255,255,255,0.10) !important; }
    .code-box { background:#111114 !important; border-color:rgba(255,255,255,0.10) !important; }
    .heading, .wordmark { color:#ededed !important; }
    .muted { color:#a7a7b0 !important; }
    .body-text { color:#c9c9d1 !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#f4f5f6;">
  ${preview}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f6;padding:40px 16px;" class="bg">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:452px;background:#ffffff;border:1px solid #eceef0;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 36px 4px;">
          <span class="wordmark" style="font-family:${FONT};font-size:19px;font-weight:700;letter-spacing:-0.02em;color:#0b0b0d;">
            <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#0d9488;vertical-align:baseline;margin-right:8px;"></span>Flagon
          </span>
        </td></tr>
        <tr><td style="padding:20px 36px 34px;font-family:${FONT};">
          ${opts.body}
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:452px;">
        <tr><td style="padding:18px 36px;text-align:center;font-family:${FONT};font-size:12px;line-height:1.6;color:#9a9aa2;" class="muted">
          Flagon - the developer platform.<br>
          You received this because this email was used with a Flagon account.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export { FONT };
