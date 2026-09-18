import { getDemoAutofill } from "@/lib/demo";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Dev-only, and only when the demo user has been seeded.
  const demo = await getDemoAutofill();
  return <LoginForm demo={demo} />;
}
