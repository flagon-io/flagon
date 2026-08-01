/**
 * No-op mocks of the flag server actions for Storybook. Each resolves to a success
 * shape ({} = no error) after a short delay, so an editor's Save flows through its
 * pending state and settles without a server or DB. Swap in `{ error: "…" }` in a
 * specific story if you want to exercise the error branch.
 */
type Result = { error?: string };

const ok = (): Promise<Result> => new Promise((r) => setTimeout(() => r({}), 300));

export async function saveRulesAction(): Promise<Result> {
  return ok();
}
export async function setDefaultServeAction(): Promise<Result> {
  return ok();
}
export async function setEnvModeAction(): Promise<Result> {
  return ok();
}
export async function setFeatureStateAction(): Promise<Result> {
  return ok();
}
export async function setDefaultVariantAction(): Promise<Result> {
  return ok();
}
