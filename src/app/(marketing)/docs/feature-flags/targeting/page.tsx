import type { Metadata } from 'next';
import { Code, DocNext, H1, H2, Lead, P, Pre, Ul } from '@/components/prose';

export const metadata: Metadata = {
  title: 'Targeting & rollouts',
  description: 'Target Flagon flags by context with rules, segments, semver gates, and sticky rollouts.',
};

export default function TargetingPage() {
  return (
    <div className="max-w-none">
      <p className="eyebrow">Feature Flags</p>
      <H1>Targeting &amp; rollouts</H1>
      <Lead>
        Decide which variant a subject receives based on its evaluation context, deterministically
        and consistently.
      </Lead>

      <H2>Rules</H2>
      <P>
        A flag&apos;s targeting is an ordered list of rules. Rules are evaluated top to bottom and the{' '}
        <strong className="text-foreground">first match wins</strong>. If nothing matches, the
        flag&apos;s default variant is returned.
      </P>

      <H2>Conditions</H2>
      <P>Conditions compare context attributes. The supported operators are:</P>
      <Ul>
        <li>Equality and set membership (<Code>eq</Code>, <Code>ne</Code>, <Code>in</Code>, <Code>nin</Code>)</li>
        <li>String matching (<Code>contains</Code>, <Code>starts_with</Code>, <Code>ends_with</Code>)</li>
        <li>Numeric comparison (<Code>gt</Code>, <Code>gte</Code>, <Code>lt</Code>, <Code>lte</Code>)</li>
        <li>Semantic version gates (<Code>semver</Code>)</li>
        <li>Boolean composition (<Code>all</Code>, <Code>any</Code>, <Code>not</Code>) and named <Code>segment</Code> references</li>
      </Ul>

      <H2>Segments</H2>
      <P>
        A segment is a named condition you define once and reference from many flags, for example an{' '}
        <Code>internal-staff</Code> segment matching <Code>email ends_with @yourco.com</Code>.
      </P>

      <H2>Percentage rollouts</H2>
      <P>
        A rule can split traffic across variants by weight. Each subject is bucketed{' '}
        <strong className="text-foreground">deterministically</strong> from its targeting key, so a
        user always lands in the same bucket and gets a consistent variant across requests and
        devices. A result from a split rule has the reason <Code>SPLIT</Code>.
      </P>
      <Pre>{`# 90/10 rollout of a boolean flag
when:  any user
then:  90% "off", 10% "on"   (bucketed by targetingKey)`}</Pre>

      <DocNext href="/docs/api" label="REST API reference" />
    </div>
  );
}
