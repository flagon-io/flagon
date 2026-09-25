package mail

import (
	"bytes"
	"html/template"
	"strings"
)

// Invite is the data for an org-invitation email.
type Invite struct {
	URL     string // the single-use accept link
	OrgName string
	Inviter string // display name; "" reads "You've been invited"
	Role    string
}

// InviteEmail renders the branded invitation email (HTML + text). The accept
// link doubles as email verification, so the invitee can register (or sign in)
// and join in one step. Every value is HTML-escaped.
func InviteEmail(to string, in Invite) Message {
	who := "You've been invited"
	if strings.TrimSpace(in.Inviter) != "" {
		who = in.Inviter + " invited you"
	}
	data := map[string]string{
		"Who":     who,
		"OrgName": in.OrgName,
		"Role":    in.Role,
		"Article": article(in.Role),
		"URL":     in.URL,
	}
	var html bytes.Buffer
	if err := inviteTemplate.Execute(&html, data); err != nil {
		html.Reset() // unreachable with a static template; the text part still carries the link
	}
	text := who + " to join " + in.OrgName + " on Flagon as " + article(in.Role) + " " + in.Role + ".\n\n" +
		"Accept your invitation by opening this link (expires in 7 days):\n\n" + in.URL + "\n\n" +
		"If you weren't expecting this, you can safely ignore this email."
	return Message{To: to, Subject: "Join " + in.OrgName + " on Flagon", HTML: html.String(), Text: text}
}

func article(role string) string {
	if role != "" && strings.ContainsRune("aeiouAEIOU", rune(role[0])) {
		return "an"
	}
	return "a"
}

const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

// inviteTemplate is the shared branded shell (header, card, footer, dark mode)
// around the invitation body. Inline styles and tables so it survives every
// mail client.
var inviteTemplate = template.Must(template.New("invite").Parse(strings.ReplaceAll(`<!doctype html>
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
    .heading, .wordmark { color:#ededed !important; }
    .muted { color:#a7a7b0 !important; }
    .body-text { color:#c9c9d1 !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#f4f5f6;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">{{.Who}} to join {{.OrgName}} on Flagon.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f6;padding:40px 16px;" class="bg">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:452px;background:#ffffff;border:1px solid #eceef0;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 36px 4px;">
          <span class="wordmark" style="font-family:FONT;font-size:19px;font-weight:700;letter-spacing:-0.02em;color:#0b0b0d;">
            <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#0d9488;vertical-align:baseline;margin-right:8px;"></span>Flagon
          </span>
        </td></tr>
        <tr><td style="padding:20px 36px 34px;font-family:FONT;">
          <h1 class="heading" style="margin:0 0 8px;font-family:FONT;font-size:21px;font-weight:700;letter-spacing:-0.02em;color:#0b0b0d;">Join {{.OrgName}} on Flagon</h1>
          <p class="body-text" style="margin:0 0 22px;font-family:FONT;font-size:14px;line-height:1.65;color:#52525a;">
            {{.Who}} to join <strong>{{.OrgName}}</strong> on Flagon as {{.Article}} {{.Role}}.
          </p>
          <a href="{{.URL}}" class="button" style="display:block;margin:0 0 18px;padding:12px 20px;text-align:center;background:#0d9488;border-radius:10px;font-family:FONT;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
            Accept invitation
          </a>
          <p class="muted" style="margin:0;font-family:FONT;font-size:13px;line-height:1.65;color:#9a9aa2;">
            This link expires in 7 days. If you weren&rsquo;t expecting this, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:452px;">
        <tr><td style="padding:18px 36px;text-align:center;font-family:FONT;font-size:12px;line-height:1.6;color:#9a9aa2;" class="muted">
          Flagon - the developer platform.<br>
          You received this because someone invited this email address to Flagon.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, "FONT", font)))
