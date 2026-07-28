/**
 * The one place the API writes logs. A thin structured-logging seam over the
 * console: one JSON object per line, which is what Vercel's log drains and most
 * aggregators want to parse. Using this instead of bare `console.*` keeps every
 * log line shaped the same and gives us a single choke point to enrich or
 * redirect later (e.g. ship to a log service) without touching call sites.
 *
 * Error reporting to Sentry is separate and lives at the request boundary
 * (see index.ts onError); the logger is for the local/stdout record.
 */
type Level = "debug" | "info" | "warn" | "error";

type Meta = Record<string, unknown> & { err?: unknown };

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function emit(level: Level, message: string, meta?: Meta) {
  const line: Record<string, unknown> = {
    level,
    message,
    time: new Date().toISOString(),
  };
  if (meta) {
    const { err, ...rest } = meta;
    Object.assign(line, rest);
    if (err !== undefined) line.err = serializeError(err);
  }
  // Route through the matching console method so log levels survive to stderr
  // (warn/error) vs stdout (info/debug).
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(JSON.stringify(line));
}

export const logger = {
  debug: (message: string, meta?: Meta) => emit("debug", message, meta),
  info: (message: string, meta?: Meta) => emit("info", message, meta),
  warn: (message: string, meta?: Meta) => emit("warn", message, meta),
  error: (message: string, meta?: Meta) => emit("error", message, meta),
};
