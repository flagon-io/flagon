import { pgClient } from "@/db/client";

const CHANNEL = "flagon_configuration_changed";
type Subscriber = () => void;
type Hub = {
  subscribers: Map<string, Set<Subscriber>>;
  listener?: Promise<void>;
};

const globalForEvents = globalThis as typeof globalThis & { __flagonOfrepEvents?: Hub };
const hub: Hub = globalForEvents.__flagonOfrepEvents ?? { subscribers: new Map<string, Set<Subscriber>>() };
if (process.env.NODE_ENV !== "production") globalForEvents.__flagonOfrepEvents = hub;

async function ensureListener() {
  if (!hub.listener) {
    hub.listener = pgClient.listen(CHANNEL, (orgId) => {
      for (const subscriber of hub.subscribers.get(orgId) ?? []) {
        try { subscriber(); } catch { /* One disconnected stream must not affect the others. */ }
      }
    }).then(() => undefined).catch((error) => {
      hub.listener = undefined;
      throw error;
    });
  }
  await hub.listener;
}

/** One PostgreSQL LISTEN connection fans out invalidations to every stream in this process. */
export async function subscribeToConfiguration(orgId: string, subscriber: Subscriber) {
  await ensureListener();
  const subscribers = hub.subscribers.get(orgId) ?? new Set<Subscriber>();
  subscribers.add(subscriber);
  hub.subscribers.set(orgId, subscribers);
  return () => {
    subscribers.delete(subscriber);
    if (!subscribers.size) hub.subscribers.delete(orgId);
  };
}
