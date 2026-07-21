import { authenticateOfrep } from "@/lib/ofrep-auth.server";
import { subscribeToConfiguration } from "@/lib/ofrep-events.server";
import { OFREP_HEADERS } from "@/lib/ofrep.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const encoder = new TextEncoder();
const streamHeaders = {
  ...OFREP_HEADERS,
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "private, no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

export function OPTIONS() { return new Response(null, { status: 204, headers: OFREP_HEADERS }); }

export async function GET(request: Request) {
  const credential = await authenticateOfrep(request, true);
  if (!credential) return Response.json({ errorCode: "UNAUTHORIZED", errorDetails: "A valid evaluation credential is required." }, { status: 401, headers: OFREP_HEADERS });

  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
    try { controller?.close(); } catch { /* The browser may already have closed the stream. */ }
  };
  const send = (message: string) => {
    if (closed) return;
    try { controller?.enqueue(encoder.encode(message)); } catch { close(); }
  };

  try {
    unsubscribe = await subscribeToConfiguration(credential.orgId, () => {
      send(`event: configuration_changed\ndata: {}\n\n`);
    });
  } catch {
    return Response.json({ errorCode: "EVENTS_UNAVAILABLE", errorDetails: "Realtime notifications are temporarily unavailable." }, { status: 503, headers: OFREP_HEADERS });
  }

  request.signal.addEventListener("abort", close, { once: true });
  const stream = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
      if (closed) { nextController.close(); return; }
      send(`retry: 3000\nevent: ready\ndata: {}\n\n`);
      heartbeat = setInterval(() => send(`: heartbeat\n\n`), 15_000);
    },
    cancel: close,
  });
  return new Response(stream, { headers: streamHeaders });
}
