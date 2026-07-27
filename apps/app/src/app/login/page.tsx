import type { Metadata } from "next";
import { brand, FlagonMark, GridBackdrop } from "@flagon/design";
import { WEB_URL } from "@/lib/urls";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${brand.name}.`,
};

export default function LoginPage() {
  return (
    <>
      <GridBackdrop />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <FlagonMark className="h-10 w-10" />
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Sign in to {brand.name}
            </h1>
            <p className="text-sm text-zinc-400">
              Welcome back. Sign in to your workspace.
            </p>
          </div>

          <div className="mt-8 rounded-xl border border-white/10 bg-white/2 p-6">
            <LoginForm />
          </div>

          <p className="mt-6 text-center text-xs text-zinc-500">
            Invite-only before launch.{" "}
            <a
              href={WEB_URL}
              className="text-teal-400 transition-colors hover:text-teal-300"
            >
              Back to {brand.domain}
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
