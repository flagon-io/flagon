"use client";

import { SiGoogle, SiGithub } from "@icons-pack/react-simple-icons";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
const GITHUB_ENABLED = process.env.NEXT_PUBLIC_GITHUB_AUTH_ENABLED === "true";

/** True when at least one social provider is configured. Auth pages use this to
 *  decide whether to show the "or" divider at all. */
export const SOCIAL_ENABLED = GOOGLE_ENABLED || GITHUB_ENABLED;

// Only configured providers render - an unconfigured provider is hidden, not a
// dead greyed-out button on a fresh deploy.
export function SocialButtons() {
  if (!SOCIAL_ENABLED) return null;
  return (
    <div className="flex flex-col gap-2">
      {GOOGLE_ENABLED && (
        <Button
          type="button"
          variant="outline"
          onClick={() => authClient.signIn.social({ provider: "google" })}
        >
          {/* Google's brand guidelines require its multicolor mark, not a
              monochrome recolor - so this one keeps its default brand color. */}
          <SiGoogle size={16} color="default" />
          Continue with Google
        </Button>
      )}
      {GITHUB_ENABLED && (
        <Button
          type="button"
          variant="outline"
          onClick={() => authClient.signIn.social({ provider: "github" })}
        >
          <SiGithub size={16} color="currentColor" />
          Continue with GitHub
        </Button>
      )}
    </div>
  );
}
