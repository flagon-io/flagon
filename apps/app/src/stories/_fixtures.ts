import type { FlagEnvConfig, FlagVariant, Segment } from "@/lib/flags-api";

/** A boolean flag's On/Off variants (value true/false drives the On/Off labels). */
export const boolVariants: FlagVariant[] = [
  { id: "v-on", key: "on", value: true, label: null, sortOrder: 0 },
  { id: "v-off", key: "off", value: false, label: null, sortOrder: 1 },
];

/** A multivariate (string) flag: three named variants. */
export const colorVariants: FlagVariant[] = [
  { id: "v-red", key: "red", value: "red", label: "Red", sortOrder: 0 },
  { id: "v-green", key: "green", value: "green", label: "Green", sortOrder: 1 },
  { id: "v-blue", key: "blue", value: "blue", label: "Blue", sortOrder: 2 },
];

export const segments: Segment[] = [
  {
    id: "seg-beta",
    key: "beta",
    name: "Beta testers",
    description: null,
    conditions: [],
  } as unknown as Segment,
];

export const allEnvironments = [
  { key: "production", name: "Production" },
  { key: "preview", name: "Preview" },
  { key: "development", name: "Development" },
];

/** A fresh, enabled boolean env with no rules (serves On to everyone). */
export function boolEnv(overrides: Partial<FlagEnvConfig> = {}): FlagEnvConfig {
  return {
    key: "production",
    name: "Production",
    enabled: true,
    defaultVariantKey: "on",
    defaultServe: null,
    offVariantKey: "off",
    reuseSourceEnvironmentKey: null,
    rules: [],
    ...overrides,
  };
}
