"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { SiGithub, SiGitlab, SiX } from "@icons-pack/react-simple-icons";
import {
  Alert,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";

const NONE = "__none__";
const PRONOUN_PRESETS = ["he/him", "she/her", "they/them"];

type Initial = {
  name: string;
  bio: string;
  pronouns: string;
  websiteUrl: string;
  company: string;
  location: string;
  social: string[];
  publicEmail: string;
};

type Account = { name: string | null; username: string | null; email: string; image: string | null };

export function ProfileForm({
  userId,
  initial,
  account,
  verifiedEmails,
}: {
  userId: string;
  initial: Initial;
  account: Account;
  verifiedEmails: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [bio, setBio] = useState(initial.bio);
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl);
  const [company, setCompany] = useState(initial.company);
  const [location, setLocation] = useState(initial.location);
  const [publicEmail, setPublicEmail] = useState(initial.publicEmail || NONE);

  // Pronouns: presets + a free-form "custom" that reveals a text input.
  const presetPronoun = PRONOUN_PRESETS.includes(initial.pronouns);
  const [pronounChoice, setPronounChoice] = useState(
    initial.pronouns === "" ? NONE : presetPronoun ? initial.pronouns : "custom",
  );
  const [customPronoun, setCustomPronoun] = useState(presetPronoun ? "" : initial.pronouns);

  // Up to four social links, padded so the inputs are always rendered.
  const [social, setSocial] = useState<string[]>(() => {
    const s = [...initial.social];
    while (s.length < 4) s.push("");
    return s.slice(0, 4);
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function setSocialAt(i: number, v: string) {
    setSocial((arr) => arr.map((x, idx) => (idx === i ? v : x)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setSaving(true);

    const pronouns =
      pronounChoice === NONE ? "" : pronounChoice === "custom" ? customPronoun.trim() : pronounChoice;
    const links = social.map((s) => s.trim()).filter(Boolean);

    const { error: err } = await authClient.updateUser({
      name: name.trim(),
      bio: bio.trim(),
      pronouns,
      websiteUrl: websiteUrl.trim(),
      company: company.trim(),
      location: location.trim(),
      socialLinks: JSON.stringify(links),
      publicEmail: publicEmail === NONE ? "" : publicEmail,
    });

    setSaving(false);
    if (err) {
      setError(err.message ?? "Couldn't save your profile.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  // Compare current values against what was loaded, so Save stays disabled until
  // something actually changes (and re-disables after a successful save, since a
  // refresh feeds new `initial` values back in).
  const currentPronouns =
    pronounChoice === NONE ? "" : pronounChoice === "custom" ? customPronoun.trim() : pronounChoice;
  const currentLinks = social.map((s) => s.trim()).filter(Boolean);
  const currentPublicEmail = publicEmail === NONE ? "" : publicEmail;
  const dirty =
    name.trim() !== initial.name ||
    bio.trim() !== initial.bio ||
    currentPronouns !== initial.pronouns ||
    websiteUrl.trim() !== initial.websiteUrl ||
    company.trim() !== initial.company ||
    location.trim() !== initial.location ||
    currentPublicEmail !== (initial.publicEmail || "") ||
    JSON.stringify(currentLinks) !== JSON.stringify(initial.social);

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col-reverse gap-8 md:flex-row md:items-start md:justify-between md:gap-10"
    >
      <div className="w-full max-w-xl space-y-5">
        <Field label="User ID" htmlFor="user-id" hint="Your unique account identifier. Referenced by the Flagon API.">
          <Input
            id="user-id"
            value={userId}
            readOnly
            disabled
            className="font-mono text-muted-foreground"
          />
        </Field>

        <Field label="Name" htmlFor="name" hint="Your name may appear around Flagon where you contribute or are mentioned.">
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Field>

        <Field
          label="Public email"
          htmlFor="public-email"
          hint="Shown on your profile. Only verified emails can be selected."
        >
          <Select value={publicEmail} onValueChange={setPublicEmail}>
            <SelectTrigger id="public-email">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Don&apos;t show an email address</SelectItem>
              {verifiedEmails.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Bio" htmlFor="bio" hint="Tell people a little about yourself.">
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={280}
            placeholder="Hacker, open sorcerer, software engineer..."
          />
        </Field>

        <Field label="Pronouns" htmlFor="pronouns">
          <div className="flex gap-2">
            <Select value={pronounChoice} onValueChange={setPronounChoice}>
              <SelectTrigger id="pronouns" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Don&apos;t specify</SelectItem>
                {PRONOUN_PRESETS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {pronounChoice === "custom" && (
              <Input
                aria-label="Custom pronouns"
                value={customPronoun}
                onChange={(e) => setCustomPronoun(e.target.value)}
                maxLength={40}
                placeholder="e.g. ze/zir"
              />
            )}
          </div>
        </Field>

        <Field label="URL" htmlFor="url">
          <Input
            id="url"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
          />
        </Field>

        <div className="space-y-1.5">
          <Label>Social accounts</Label>
          <div className="space-y-2">
            {social.map((value, i) => {
              return (
                <div key={i} className="flex items-center gap-2">
                  <SocialIcon url={value} />
                  <Input
                    aria-label={`Social account ${i + 1}`}
                    type="url"
                    value={value}
                    onChange={(e) => setSocialAt(i, e.target.value)}
                    placeholder={`Link to social profile ${i + 1}`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <Field label="Company" htmlFor="company">
          <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={100} />
        </Field>

        <Field label="Location" htmlFor="location">
          <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} />
        </Field>

        {error && <Alert variant="destructive">{error}</Alert>}
        {done && <Alert variant="success">Profile updated.</Alert>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? "Saving..." : "Update profile"}
          </Button>
          {!dirty && !saving && !done && (
            <span className="text-xs text-muted-foreground">No unsaved changes.</span>
          )}
        </div>
      </div>

      {/* Avatar (display-only for now; upload needs blob storage). */}
      <div className="md:pt-1">
        <p className="mb-2 text-sm font-medium text-foreground">Profile picture</p>
        <Avatar className="size-40 border border-hairline">
          {account.image && <AvatarImage src={account.image} alt="" />}
          <AvatarFallback className="text-4xl font-semibold">{initials(account)}</AvatarFallback>
        </Avatar>
        <div className="mt-2 flex max-w-40 flex-col items-start gap-1.5">
          <Badge variant="outline">Coming soon</Badge>
          <p className="text-xs text-muted-foreground">Custom avatar upload.</p>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Brand marks live in simple-icons now (lucide dropped them); anything without a
// known mark - including LinkedIn, which simple-icons omits - uses a globe.
function SocialIcon({ url }: { url: string }) {
  const u = url.toLowerCase();
  const cls = "size-4 shrink-0 text-muted-foreground";
  if (u.includes("github.")) return <SiGithub size={16} color="currentColor" className={cls} />;
  if (u.includes("gitlab.")) return <SiGitlab size={16} color="currentColor" className={cls} />;
  if (u.includes("x.com") || u.includes("twitter.")) return <SiX size={16} color="currentColor" className={cls} />;
  return <Globe className={cls} />;
}

function initials(a: Account): string {
  const base = (a.name || a.username || a.email || "").trim();
  const parts = base.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase() || "?";
}
