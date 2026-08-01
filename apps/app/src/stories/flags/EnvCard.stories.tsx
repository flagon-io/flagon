import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnvCard } from "@/app/[org]/flags/[key]/env-controls";
import { allEnvironments, boolEnv, boolVariants, segments } from "../_fixtures";

/**
 * The environment card: the Off | On | Rules | Reuse control and everything it
 * reveals. Server actions and the router are mocked (see .storybook/mocks), so
 * Save flows through its pending state without a backend.
 */
const meta: Meta<typeof EnvCard> = {
  title: "Flags/EnvCard",
  component: EnvCard,
  args: {
    slug: "acme",
    flagKey: "checkout-v2",
    variants: boolVariants,
    segments,
    isBoolean: true,
    allEnvironments,
  },
};
export default meta;
type Story = StoryObj<typeof EnvCard>;

export const On: Story = {
  args: { env: boolEnv({ enabled: true }) },
};

export const Off: Story = {
  args: { env: boolEnv({ enabled: false }) },
};

export const WithRules: Story = {
  args: {
    env: boolEnv({
      enabled: true,
      rules: [
        {
          id: "rule-1",
          priority: 0,
          description: "Pro accounts",
          conditions: [{ attribute: "plan", op: "eq", values: ["pro"] }],
          serve: { variant: "on" },
        },
      ],
    }),
  },
};

export const DefaultProgressive: Story = {
  name: "Default · progressive rollout",
  args: {
    env: boolEnv({
      enabled: true,
      defaultServe: {
        progressive: {
          variant: "on",
          fallback: "off",
          start: 0,
          steps: [
            { percent: 5, durationMs: 6 * 3_600_000 },
            { percent: 10, durationMs: 6 * 3_600_000 },
            { percent: 25, durationMs: 6 * 3_600_000 },
            { percent: 60, durationMs: 6 * 3_600_000 },
          ],
        },
      },
    }),
  },
};

export const ReuseAnotherEnvironment: Story = {
  name: "Reuse another environment",
  args: {
    env: boolEnv({ key: "preview", name: "Preview", reuseSourceEnvironmentKey: "production" }),
  },
};
