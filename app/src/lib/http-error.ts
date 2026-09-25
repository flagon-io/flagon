// HttpError is an error that carries the HTTP status it should surface as. The
// gateway's ApiError extends it (preserving the Go API's upstream status), and
// app-owned server code (e.g. the user-emails store) throws it directly so route
// handlers can pass the right status through `routeError` instead of a blanket 400.
// Client-safe: no server imports.
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function isHttpError(e: unknown): e is HttpError {
  return e instanceof HttpError;
}
