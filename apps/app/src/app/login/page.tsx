import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@flagon/design";
import { AuthShell } from "@/components/auth-shell";
import { getSession } from "@/lib/auth";
import { configuredOAuthProviders } from "@/lib/oauth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${brand.name}.`,
};

export default async function LoginPage() {
  // Authoritative check: genuinely-signed-in visitors skip the form. A stale or
  // invalid cookie returns null here, so the page just renders (no loop).
  if (await getSession()) redirect("/");

  return (
    <AuthShell
      title={`Sign in to ${brand.name}`}
      subtitle="Welcome back. Sign in to your workspace."
      footer={
        <>
          {`New to ${brand.name}? `}
          <Link
            href="/signup"
            className="text-teal-400 transition-colors hover:text-teal-300"
          >
            Create an account
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm providers={configuredOAuthProviders()} />
      </Suspense>
    </AuthShell>
  );
}
