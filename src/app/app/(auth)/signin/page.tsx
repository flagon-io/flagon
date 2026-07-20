import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { redirectIfAuthenticated } from "../session";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = {
  title: `Sign in to ${brand.name}`,
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  await redirectIfAuthenticated();
  const { reset } = await searchParams;
  return <SignInForm passwordWasReset={reset === "1"} />;
}
