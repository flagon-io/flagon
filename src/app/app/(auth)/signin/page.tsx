import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { redirectIfAuthenticated } from "@/lib/auth-guards.server";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = {
  title: `Sign in to ${brand.name}`,
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; next?: string }>;
}) {
  const { reset, next } = await searchParams;
  // Already signed in? Honor `next` so a shared link lands where it points.
  await redirectIfAuthenticated(next);
  return <SignInForm passwordWasReset={reset === "1"} next={next} />;
}
