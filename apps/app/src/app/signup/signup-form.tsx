import { brand } from "@flagon/design";
import { WEB_URL } from "@/lib/urls";
import { Field, submitButtonClass } from "@/components/field";

/**
 * Registration isn't open yet, so the whole form renders disabled: the real
 * fields are shown (this is exactly what signup will look like) but nothing is
 * interactive, and a notice explains why and points at the waitlist. When
 * registration opens this becomes a client component with a submit handler and
 * the `disabled` props come off. No backend exists yet either way.
 */
export function SignupForm() {
  return (
    <form className="flex flex-col gap-4" aria-describedby="signup-closed">
      <div
        id="signup-closed"
        className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs leading-5 text-amber-300"
      >
        {`Sign-ups aren't open yet. ${brand.launch.label}. `}
        <a
          href={`${WEB_URL}/#waitlist`}
          className="font-medium underline underline-offset-2 hover:text-amber-200"
        >
          Join the waitlist
        </a>
        {" and we'll be in touch."}
      </div>

      <Field
        id="name"
        label="Name"
        type="text"
        name="name"
        autoComplete="name"
        placeholder="Robin Vale"
        disabled
      />
      <Field
        id="email"
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="you@company.com"
        disabled
      />
      <Field
        id="password"
        label="Password"
        type="password"
        name="password"
        autoComplete="new-password"
        placeholder="••••••••"
        disabled
      />

      <button type="submit" className={submitButtonClass} disabled>
        Create account
      </button>
    </form>
  );
}
