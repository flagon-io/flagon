import { llmsText } from "@/lib/llms";

// Serves /llms.txt - a concise, LLM-oriented map of the component library.
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return new Response(llmsText(origin, false), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
