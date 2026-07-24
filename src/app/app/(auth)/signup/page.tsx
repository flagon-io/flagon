import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { redirectIfAuthenticated } from "@/lib/auth-guards.server";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = {
  title: `Sign up for ${brand.name}`,
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  await redirectIfAuthenticated(next);
  return <SignUpForm next={next} />;
}
