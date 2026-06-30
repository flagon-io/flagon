import { render } from '@react-email/render';
import { sendEmail } from './index';
import { appUrl } from './urls';
import { OrgInviteEmail } from './templates/org-invite';
import { PasswordResetEmail } from './templates/password-reset';
import { WaitlistApprovedEmail } from './templates/waitlist-approved';
import { WaitlistJoinedEmail } from './templates/waitlist-joined';

export async function sendOrgInvite(opts: {
  to: string;
  orgName: string;
  inviterName: string;
  invitationId: string;
}) {
  const html = await render(
    <OrgInviteEmail
      orgName={opts.orgName}
      inviterName={opts.inviterName}
      email={opts.to}
      inviteUrl={appUrl(`/app/invite/${opts.invitationId}`)}
    />,
  );
  await sendEmail({ to: opts.to, subject: `You've been invited to ${opts.orgName} on Flagon`, html });
}

export async function sendPasswordReset(opts: { to: string; token: string }) {
  const html = await render(
    <PasswordResetEmail resetUrl={appUrl(`/app/reset-password?token=${opts.token}`)} />,
  );
  await sendEmail({ to: opts.to, subject: 'Reset your Flagon password', html });
}

export async function sendWaitlistJoined(to: string) {
  const html = await render(<WaitlistJoinedEmail />);
  await sendEmail({ to, subject: "You're on the Flagon waitlist", html });
}

export async function sendWaitlistApproved(to: string) {
  const html = await render(<WaitlistApprovedEmail signUpUrl={appUrl('/app/signup?register=1')} />);
  await sendEmail({ to, subject: "You're in. Create your Flagon account", html });
}
