"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Code2, Copy } from "lucide-react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@flagon/design";
import { WEB_URL } from "@/lib/urls";

export function UseInCodeButton({ slug, flagKey }: { slug: string; flagKey: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const snippet = `curl -X POST "$FLAGON_API/ofrep/v1/evaluate/flags/${flagKey}" \\
  -H "Authorization: Bearer $FLAGON_SDK_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"context":{"targetingKey":"user-123"}}'`;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Code2 className="h-4 w-4" /> Use in Code
      </Button>
      {open ? (
        <Modal onClose={() => setOpen(false)} size="lg">
          <ModalHeader
            title="Use in Code"
            description="Evaluate this flag with the OpenFeature OFREP provider."
            onClose={() => setOpen(false)}
          />
          <ModalBody>
            <p className="mb-3 text-sm text-zinc-500">
              Authenticate with an SDK key for the environment — create one under{" "}
              <Link href={`/${slug}/flags/keys`} className="text-teal-400 hover:underline">
                SDK Keys
              </Link>
              .
            </p>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 pr-12 text-xs leading-relaxed text-zinc-300">
                {snippet}
              </pre>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(snippet);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-zinc-900 text-zinc-300 hover:bg-white/5"
              >
                {copied ? <Check className="h-4 w-4 text-teal-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </ModalBody>
          <ModalFooter>
            <a
              href={`${WEB_URL}/docs/feature-flags/evaluate/openfeature`}
              target="_blank"
              rel="noreferrer"
              className="mr-auto self-center text-sm text-teal-400 hover:underline"
            >
              Integration guide ↗
            </a>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
}
