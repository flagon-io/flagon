import { Section, Text } from '@react-email/components';
import { EmailButton, EmailLayout, styles } from './layout';

export function OrgInviteEmail({
  orgName,
  inviterName,
  inviteUrl,
  email,
}: {
  orgName: string;
  inviterName: string;
  inviteUrl: string;
  email: string;
}) {
  return (
    <EmailLayout preview={`You've been invited to ${orgName} on Flagon`}>
      <Text style={styles.heading}>Join {orgName} on Flagon</Text>
      <Text style={styles.text}>
        <strong>{inviterName}</strong> invited you to collaborate in <strong>{orgName}</strong> on
        Flagon, the open-source developer platform.
      </Text>
      <Section style={{ margin: '8px 0 24px' }}>
        <EmailButton href={inviteUrl}>Accept invitation</EmailButton>
      </Section>
      <Text style={styles.muted}>
        This invite is for {email}. If you already have a Flagon account, sign in and accept it from
        your Invitations page. If you don&apos;t, create an account with this address and the invite
        will be waiting for you.
      </Text>
    </EmailLayout>
  );
}
