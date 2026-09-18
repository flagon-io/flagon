"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@flagon-io/ui";
import type { Project } from "@/lib/flagon-api";
import { Markdown } from "@/components/markdown";

const PLACEHOLDER = `# My project

What it does, how to run it, anything a teammate should know.`;

export function ReadmeEditor({ orgSlug, project }: { orgSlug: string; project: Project }) {
  const router = useRouter();
  const overview = `/${orgSlug}/projects/${project.slug}`;
  const [readme, setReadme] = useState(project.readme);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = readme !== project.readme;

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(
      `/api/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(project.slug)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readme }),
      },
    );
    if (!res.ok) {
      setSaving(false);
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't save the README.");
      return;
    }
    router.push(overview);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="edit">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-hairline bg-panel/50 px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FileText className="size-4 text-muted-foreground" />
              README.md
            </span>
            <TabsList>
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="edit" className="m-0">
            <Textarea
              value={readme}
              onChange={(e) => setReadme(e.target.value)}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              className="min-h-112 resize-y rounded-none border-0 font-mono text-sm focus-visible:ring-0"
              autoFocus
            />
          </TabsContent>

          <TabsContent value="preview" className="m-0 p-6">
            {readme.trim() ? (
              <Markdown>{readme}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
            )}
          </TabsContent>
        </Card>
      </Tabs>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving..." : "Save README"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={overview}>Cancel</Link>
        </Button>
      </div>
    </div>
  );
}
