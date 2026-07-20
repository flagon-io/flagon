import type { Metadata } from "next";
import { isEmailConfigured } from "@/lib/email";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
};

export default function ForgotPasswordPage() {
  // Server-side env check, passed down as a plain boolean so the form can warn
  // self-hosters that the reset link only lands in the server logs.
  return <ForgotPasswordForm emailConfigured={isEmailConfigured()} />;
}
