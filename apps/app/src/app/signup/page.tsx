import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@flagon/design";
import { AuthShell } from "@/components/auth-shell";
import { getSession } from "@/lib/auth";
import { configuredOAuthProviders } from "@/lib/oauth";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: `Create your ${brand.name} account.`,
};

export default async function SignupPage() {
  if (await getSession()) redirect("/");

  return (
    <AuthShell
      title={`Create your ${brand.name} account`}
      subtitle="One account for your projects, environments, and teams."
      footer={
        <>
          {"Already have an account? "}
          <Link
            href="/login"
            className="text-teal-400 transition-colors hover:text-teal-300"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm providers={configuredOAuthProviders()} />
    </AuthShell>
  );
}
