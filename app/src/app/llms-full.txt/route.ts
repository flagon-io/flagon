import { llmsText } from "@/lib/llms";

// Serves /llms-full.txt - the same map with per-component registry URLs + deps.
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return new Response(llmsText(origin, true), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
