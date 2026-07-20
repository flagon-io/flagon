/**
 * Tiny user-agent summarizer for the sessions list ("Chrome on Windows").
 * Intentionally coarse: this is display sugar, not detection.
 */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";

  const ua = userAgent.toLowerCase();

  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("opr/") || ua.includes("opera")
      ? "Opera"
      : ua.includes("firefox/")
        ? "Firefox"
        : ua.includes("chrome/")
          ? "Chrome"
          : ua.includes("safari/")
            ? "Safari"
            : ua.includes("curl/")
              ? "curl"
              : "Unknown browser";

  const os = ua.includes("windows")
    ? "Windows"
    : ua.includes("iphone") || ua.includes("ipad")
      ? "iOS"
      : ua.includes("mac os")
        ? "macOS"
        : ua.includes("android")
          ? "Android"
          : ua.includes("linux")
            ? "Linux"
            : null;

  return os ? `${browser} on ${os}` : browser;
}
