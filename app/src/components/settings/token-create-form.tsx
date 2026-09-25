"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DateField,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@flagon-io/ui";
import { errorMessage } from "@/lib/client-fetch";
import type { TokenScope } from "@/lib/api/types";

// A classic-token-style scope tree: exactly two levels. A group has one parent
// scope (the superset) and a FLAT list of the finer scopes beneath it, all shown
// at a single indent - never a scope nested inside another scope. Which scope
// grants which is a separate concern (SCOPE_IMPLIES below), so a linear chain
// like admin:org > write:org > read:org still renders as one parent with two
// sibling children.
type ScopeNode = { value: TokenScope; desc: string };
type ScopeGroup = "Account" | "Organizations" | "Projects" | "Teams" | "Notifications";

const GROUP_ORDER: ScopeGroup[] = ["Account", "Organizations", "Projects", "Teams", "Notifications"];

// Every scope the API accepts, keyed by the generated TokenScope type (the API's
// one scope list, AllScopes in api/internal/server/scopes.go). Being a Record over
// that type, a scope added to the API that is missing here is a type error, so the
// checklist cannot silently fall behind. Within a group, list scopes from most to
// least privileged: the first is the group's parent, and each scope implies every
// scope listed after it (the API's implication table, admin > write > read).
const SCOPES: Record<TokenScope, { group: ScopeGroup; desc: string }> = {
  "admin:user": { group: "Account", desc: "Full control of your account, including deletion" },
  user: { group: "Account", desc: "Account writes (none today; your profile is edited in the dashboard). Implies read:user" },
  "read:user": { group: "Account", desc: "Read your profile" },
  "admin:org": {
    group: "Organizations",
    desc: "Full control: create, leave, delete and restore organizations",
  },
  "write:org": { group: "Organizations", desc: "Manage members and organization settings" },
  "read:org": { group: "Organizations", desc: "Read organizations and members" },
  "admin:project": {
    group: "Projects",
    desc: "Delete and restore projects, and manage their collaborators, teams and owners",
  },
  "write:project": { group: "Projects", desc: "Create and update projects" },
  "read:project": { group: "Projects", desc: "Read projects, collaborators, teams and owners" },
  "admin:team": { group: "Teams", desc: "Delete teams" },
  "write:team": { group: "Teams", desc: "Create and edit teams, and manage their members" },
  "read:team": { group: "Teams", desc: "Read teams and their members" },
  notifications: { group: "Notifications", desc: "Read and manage your notifications" },
};

const SCOPE_GROUPS: { group: ScopeGroup; parent: ScopeNode; children: ScopeNode[] }[] =
  GROUP_ORDER.map((group) => {
    const nodes = (Object.keys(SCOPES) as TokenScope[])
      .filter((value) => SCOPES[value].group === group)
      .map((value) => ({ value, desc: SCOPES[value].desc }));
    return { group, parent: nodes[0], children: nodes.slice(1) };
  });

// value -> every scope it transitively grants: the scopes listed after it in its
// group. This is what nests the scopes (checking a parent locks its grantees
// checked); the layout stays flat.
const SCOPE_IMPLIES: Record<string, string[]> = Object.fromEntries(
  SCOPE_GROUPS.flatMap((g) => {
    const ordered = [g.parent, ...g.children].map((n) => n.value);
    return ordered.map((value, i) => [value, ordered.slice(i + 1)]);
  }),
);

function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

function presetExpiryLabel(days: string): string {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function TokenCreateForm({
  basePath,
  kind,
  backHref,
}: {
  basePath: string;
  kind: "pat" | "oat";
  backHref: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("member");
  const [expiry, setExpiry] = useState("30");
  const [customDate, setCustomDate] = useState<Date | null>(null);
  const [full, setFull] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  // Is `value` granted because a checked ancestor implies it?
  function impliedBy(value: string, set: Set<string>): boolean {
    for (const s of set) {
      if (SCOPE_IMPLIES[s]?.includes(value)) return true;
    }
    return false;
  }

  function toggleScope(value: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
        return next;
      }
      // Adding a scope makes any scope it implies redundant - drop them so the
      // stored set stays minimal (the parent covers them).
      for (const child of SCOPE_IMPLIES[value] ?? []) next.delete(child);
      next.add(value);
      return next;
    });
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await fetch(basePath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        role: kind === "oat" ? role : undefined,
        full: full || undefined,
        scopes: full ? undefined : Array.from(selected),
        expires_in_days: expiry === "custom" ? undefined : Number(expiry),
        expires_at: expiry === "custom" && customDate ? customDate.toISOString() : undefined,
      }),
    });
    setCreating(false);
    if (!res.ok) {
      setError(await errorMessage(res, "Couldn't create the token."));
      return;
    }
    const d = await res.json();
    setSecret(d.token);
  }

  if (secret) {
    return <Created secret={secret} backHref={backHref} onDone={() => router.push(backHref)} />;
  }

  const expiryOk = expiry !== "custom" || customDate != null;
  const canSubmit = name.trim() && (full || selected.size > 0) && expiryOk && !creating;

  return (
    <form onSubmit={create} className="max-w-2xl space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="token-name">Token name</Label>
        <Input
          id="token-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. CI pipeline"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">Something you&rsquo;ll recognize later.</p>
      </div>

      {kind === "oat" && (
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The role this token acts with inside the organization. It can never exceed this.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Expiration</Label>
        <div className="flex flex-wrap items-start gap-2">
          <Select value={expiry} onValueChange={setExpiry}>
            <SelectTrigger className="w-full max-w-xs sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
              <SelectItem value="365">1 year</SelectItem>
              <SelectItem value="custom">Custom...</SelectItem>
              <SelectItem value="0">No expiration</SelectItem>
            </SelectContent>
          </Select>
          {expiry === "custom" && (
            <DateField
              className="w-full max-w-xs sm:w-56"
              aria-label="Custom expiration date"
              min={tomorrow()}
              onChange={setCustomDate}
            />
          )}
        </div>
        {expiry !== "custom" && expiry !== "0" && (
          <p className="text-xs text-muted-foreground">
            The token will expire on {presetExpiryLabel(expiry)}.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Permissions</Label>
        <p className="text-xs text-muted-foreground">
          Scopes limit what this token can do. It can still never do more than {kind === "oat" ? "its role" : "you"} can.
        </p>

        <label className="mt-1 flex cursor-pointer items-start gap-2.5 rounded-lg border border-hairline p-3 text-sm">
          <Checkbox className="mt-0.5" checked={full} onCheckedChange={(v) => setFull(v === true)} />
          <span>
            <span className="font-medium text-foreground">Full access</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              No scope restrictions (still bounded by {kind === "oat" ? "the role" : "your role"}).
            </span>
          </span>
        </label>

        <div
          className={cn(
            "divide-y divide-hairline rounded-lg border border-hairline",
            full && "pointer-events-none opacity-50",
          )}
        >
          {SCOPE_GROUPS.map((g) => (
            <div key={g.group} className="py-1.5">
              <p className="px-3 pt-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {g.group}
              </p>
              <ScopeRow
                node={g.parent}
                depth={0}
                full={full}
                selected={selected}
                impliedBy={impliedBy}
                onToggle={toggleScope}
              />
              {g.children.map((child) => (
                <ScopeRow
                  key={child.value}
                  node={child}
                  depth={1}
                  full={full}
                  selected={selected}
                  impliedBy={impliedBy}
                  onToggle={toggleScope}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {creating ? "Generating..." : "Generate token"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={backHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

function ScopeRow({
  node,
  depth,
  full,
  selected,
  impliedBy,
  onToggle,
}: {
  node: ScopeNode;
  depth: number;
  full: boolean;
  selected: Set<string>;
  impliedBy: (value: string, set: Set<string>) => boolean;
  onToggle: (value: string) => void;
}) {
  const implied = impliedBy(node.value, selected);
  const checked = full || selected.has(node.value) || implied;
  const locked = full || implied;
  // Children sit at exactly one indent, aligned under the parent's label text.
  const indent = depth > 0 ? 38 : 12;
  return (
    <label
      className={cn(
        "flex items-start gap-2.5 py-2 pr-3 text-sm",
        locked ? "cursor-default" : "cursor-pointer",
      )}
      style={{ paddingLeft: indent }}
    >
      <Checkbox
        className="mt-0.5"
        disabled={locked}
        checked={checked}
        onCheckedChange={() => onToggle(node.value)}
      />
      <span>
        <span className="font-mono font-medium text-foreground">{node.value}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{node.desc}</span>
      </span>
    </label>
  );
}

function Created({
  secret,
  backHref,
  onDone,
}: {
  secret: string;
  backHref: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* selectable */
    }
  }
  return (
    <div className="max-w-2xl space-y-4">
      <Alert variant="success">
        Token created. <strong>Copy it now.</strong> You won&rsquo;t be able to see it again.
      </Alert>
      <Card className="flex items-center gap-2 p-2">
        <code className="flex-1 truncate px-1 font-mono text-sm text-foreground select-all">
          {secret}
        </code>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </Card>
      <div>
        <Button onClick={onDone}>Done</Button>
        <Link href={backHref} className="sr-only">
          Back
        </Link>
      </div>
    </div>
  );
}
