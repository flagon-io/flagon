import { Section, Text } from '@react-email/components';
import { EmailButton, EmailLayout, styles } from './layout';

export function WaitlistApprovedEmail({ signUpUrl }: { signUpUrl: string }) {
  return (
    <EmailLayout preview="You're in. Create your Flagon account">
      <Text style={styles.heading}>You&apos;re in 🍺</Text>
      <Text style={styles.text}>
        Your Flagon early-access spot is ready. Create your account with this email address to get
        started.
      </Text>
      <Section style={{ margin: '8px 0 24px' }}>
        <EmailButton href={signUpUrl}>Create your account</EmailButton>
      </Section>
      <Text style={styles.muted}>
        Use the same email this was sent to so we can match your approval.
      </Text>
    </EmailLayout>
  );
}
