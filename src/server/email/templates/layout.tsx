import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const styles = {
  heading: { fontSize: 22, fontWeight: 700, color: '#0a0a0b', margin: '20px 0 12px', lineHeight: '28px' } as const,
  text: { fontSize: 15, lineHeight: '24px', color: '#3f3f46', margin: '0 0 16px' } as const,
  muted: { fontSize: 13, lineHeight: '20px', color: '#71717a', margin: '0 0 12px' } as const,
};

export function EmailButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: '#ff6a14',
        color: '#000000',
        fontSize: 14,
        fontWeight: 600,
        borderRadius: 8,
        padding: '11px 22px',
        textDecoration: 'none',
        display: 'inline-block',
      }}
    >
      {children}
    </Button>
  );
}

export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#f4f4f5', fontFamily: FONT, margin: 0, padding: '32px 12px' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e7e7ea',
            borderRadius: 14,
            maxWidth: 480,
            margin: '0 auto',
            padding: 32,
          }}
        >
          <Section>
            <Text style={{ fontSize: 17, fontWeight: 700, color: '#0a0a0b', margin: 0 }}>
              <span style={{ color: '#ff6a14' }}>◆</span>&nbsp; Flagon
            </Text>
          </Section>
          {children}
          <Hr style={{ borderColor: '#e7e7ea', margin: '28px 0 16px' }} />
          <Text style={{ fontSize: 12, lineHeight: '18px', color: '#a1a1aa', margin: 0 }}>
            Flagon, LLC. The open-source developer platform.
            <br />
            You received this because someone used this address with Flagon.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
