"use client";

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@flagon-io/ui";
import { Preview } from "./preview";
import { CodeBlock } from "./code-block";

/** shadcn-style Preview / Code tabbed example block. */
export function ComponentPreview({
  preview,
  code,
}: {
  preview: ReactNode;
  code: string;
}) {
  return (
    <Tabs defaultValue="preview" className="w-full">
      <TabsList>
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
      </TabsList>
      <TabsContent value="preview" className="mt-3">
        <Preview>{preview}</Preview>
      </TabsContent>
      <TabsContent value="code" className="mt-3">
        <CodeBlock code={code} />
      </TabsContent>
    </Tabs>
  );
}
