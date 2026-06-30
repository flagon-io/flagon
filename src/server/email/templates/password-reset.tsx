import { Section, Text } from '@react-email/components';
import { EmailButton, EmailLayout, styles } from './layout';

export function PasswordResetEmail({ resetUrl }: { resetUrl: string }) {
  return (
    <EmailLayout preview="Reset your Flagon password">
      <Text style={styles.heading}>Reset your password</Text>
      <Text style={styles.text}>
        We received a request to reset the password for your Flagon account. Click below to choose a
        new one. This link expires in 1 hour.
      </Text>
      <Section style={{ margin: '8px 0 24px' }}>
        <EmailButton href={resetUrl}>Reset password</EmailButton>
      </Section>
      <Text style={styles.muted}>
        If you didn&apos;t request this, you can safely ignore this email. Your password won&apos;t
        change.
      </Text>
    </EmailLayout>
  );
}
