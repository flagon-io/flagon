import { Text } from '@react-email/components';
import { EmailLayout, styles } from './layout';

export function WaitlistJoinedEmail() {
  return (
    <EmailLayout preview="You're on the Flagon waitlist">
      <Text style={styles.heading}>You&apos;re on the list 🎉</Text>
      <Text style={styles.text}>
        Thanks for your interest in Flagon, the open-source developer platform. We&apos;re rolling
        out access in batches, and we&apos;ll email you the moment your spot opens.
      </Text>
      <Text style={styles.text}>
        In the meantime, Flagon is open source: you can self-host the whole thing today.
      </Text>
      <Text style={styles.muted}>No spam, no pitch decks. Just early access when we&apos;re ready.</Text>
    </EmailLayout>
  );
}
