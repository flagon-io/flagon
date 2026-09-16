"use client";

import { SiGoogle, SiGithub } from "@icons-pack/react-simple-icons";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
const GITHUB_ENABLED = process.env.NEXT_PUBLIC_GITHUB_AUTH_ENABLED === "true";

// Always rendered so the auth pages don't need to change shape once these
// providers are configured - they just flip from disabled to enabled.
export function SocialButtons() {
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={!GOOGLE_ENABLED}
        onClick={() => authClient.signIn.social({ provider: "google" })}
        title={
          GOOGLE_ENABLED ? undefined : "Google sign-in isn't configured yet"
        }
      >
        {/* Google's brand guidelines require its multicolor mark, not a
            monochrome recolor - so this one keeps its default brand color. */}
        <SiGoogle size={16} color="default" />
        Continue with Google
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!GITHUB_ENABLED}
        onClick={() => authClient.signIn.social({ provider: "github" })}
        title={
          GITHUB_ENABLED ? undefined : "GitHub sign-in isn't configured yet"
        }
      >
        <SiGithub size={16} color="currentColor" />
        Continue with GitHub
      </Button>
    </div>
  );
}
