/** Static API identity, surfaced in the OpenAPI document and health check. */
export const META = {
  name: "Flagon",
  service: "flagon-api",
  version: "0.1.0",
  description:
    "The Flagon control plane. Everything the product does that needs to be live is an endpoint here; the marketing site and the app render screens and call this.",
} as const;
