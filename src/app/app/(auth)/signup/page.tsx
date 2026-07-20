import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { redirectIfAuthenticated } from "../session";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = {
  title: `Sign up for ${brand.name}`,
};

export default async function SignUpPage() {
  await redirectIfAuthenticated();
  return <SignUpForm />;
}
