import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { appHref } from "@/lib/urls";

export const metadata: Metadata = {
  title: "Authentication",
  description: `How accounts, email addresses, sessions, and passwords work on ${brand.name}.`,
};

const h2 = "mt-12 text-xl font-semibold tracking-tight text-zinc-100";
const h3 = "mt-8 text-base font-semibold text-zinc-100";
const p = "mt-3 text-sm leading-6 text-zinc-400";
const li = "text-sm leading-6 text-zinc-400";
const a = "text-teal-400 transition hover:text-teal-300 hover:underline";
const code = "rounded bg-white/5 px-1 py-0.5 text-[13px] text-zinc-200";

/**
 * Concept documentation for accounts and authentication. Everything described
 * here is live product behavior; update this page in the same change as the
 * behavior it documents.
 */
export default function AuthenticationDocsPage() {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        Concepts
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
        Authentication
      </h1>
      <p className={p}>
        A {brand.name} account is a username, one or more email addresses,
        and a password. This page covers how
        accounts, email verification, sessions, and passwords behave, and how
        authentication applies to the API.
      </p>

      <h2 className={h2}>Accounts</h2>
      <p className={p}>
        You sign up with an email address, a password (at least 8 characters),
        and a username. Usernames are unique across the platform, may only
        contain alphanumeric characters or single hyphens, cannot begin or end
        with a hyphen, and are between 2 and 39 characters. You can change
        your username at any time in{" "}
        <Link href={appHref("/settings/account")} className={a}>
          account settings
        </Link>
        .
      </p>
      <p className={p}>
        At sign-in, one field accepts either your username or any verified
        email address on your account, plus your password.
      </p>

      <h2 className={h2}>Email addresses</h2>
      <p className={p}>
        An account can have multiple email addresses, managed in{" "}
        <Link href={appHref("/settings/emails")} className={a}>
          email settings
        </Link>
        . One address is always the <em>primary</em>: it receives account
        notifications such as password resets, and it is the address{" "}
        {brand.name} considers canonical. Every address is globally unique; an
        email in use on any account (primary or not) cannot be added to
        another.
      </p>

      <h3 className={h3}>Verification</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li className={li}>
          Signing up sends a verification link to your address. The link
          expires in 1 hour; you can resend it from the banner in the console
          or from email settings.
        </li>
        <li className={li}>
          You can sign in with an unverified primary email. Locking you out of
          the account that could resend the verification would be worse, so
          the console shows a persistent reminder instead.
        </li>
        <li className={li}>
          You cannot add additional addresses until your primary is verified,
          and only verified addresses can be used at sign-in or promoted to
          primary.
        </li>
      </ul>

      <h3 className={h3}>Changing your primary email</h3>
      <p className={p}>
        Verify an alternate address, then choose <b>Make primary</b>. The
        previous primary stays on your account as an alternate and can be
        removed afterwards. Your sign-in credentials follow the primary
        automatically.
      </p>

      <h2 className={h2}>Sessions</h2>
      <p className={p}>
        Signing in creates a browser session that spans the whole platform
        (the app, the marketing site, and the API share it on{" "}
        <span className={code}>*.{brand.domain}</span>). The{" "}
        <Link href={appHref("/settings/sessions")} className={a}>
          sessions page
        </Link>{" "}
        lists every device signed in to your account with its browser,
        platform, IP address, and sign-in time; you can revoke any single
        session or sign out everywhere else in one click.
      </p>

      <h2 className={h2}>Passwords</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li className={li}>
          Change your password in account settings; by default this signs out
          all other sessions.
        </li>
        <li className={li}>
          Forgot it? The reset flow emails a single-use link (expires in 1
          hour) to your primary address, whichever of your account&apos;s
          emails you typed into the form.
        </li>
      </ul>

      <h2 className={h2}>Deleting your account</h2>
      <p className={p}>
        Account deletion is self-service in the danger zone of account
        settings, confirmed by typing your username and password. Deletion is
        permanent and removes your data from {brand.name}.
      </p>

      <h2 className={h2}>Authenticating with the API</h2>
      <p className={p}>
        The API is designed around access tokens: <em>personal access tokens</em>{" "}
        that act as you, and <em>organization access tokens</em> for automation
        owned by an org, both sent as a Bearer token in the{" "}
        <span className={code}>Authorization</span> header. Token issuance
        opens with the Access tokens settings page; until then, requests from
        a signed-in browser authenticate with the session cookie (which is how
        the interactive console in the API reference works). Account security
        operations, changing passwords, managing email addresses, are
        deliberately not exposed via the API.
      </p>
      <p className={p}>
        See the{" "}
        <Link href="/docs/api" className={a}>
          API reference
        </Link>{" "}
        for the available endpoints.
      </p>
    </div>
  );
}
