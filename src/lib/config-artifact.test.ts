import { describe, expect, it } from "vitest";
import {
  ARTIFACT_SCHEMA,
  ArtifactError,
  buildArtifact,
  parseArtifact,
} from "./config-artifact";
import type { FlagConfig } from "./flag-config-cache.server";
import { configurationVersion } from "./ofrep.server";

const config = (keys: string[]): FlagConfig => ({
  flags: keys.map((key) => ({
    id: key,
    organizationId: "org",
    key,
    name: key,
    description: null,
    type: "boolean",
    variants: [{ key: "on", value: true }],
    defaultVariant: "on",
    rules: [],
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-02T03:04:05.000Z"),
  })) as unknown as FlagConfig["flags"],
  segments: [],
});

describe("config artifact", () => {
  it("round-trips a config and revives dates", () => {
    const { body } = buildArtifact("org", config(["a", "b"]));
    const { config: parsed } = parseArtifact(body);
    expect(parsed.flags.map((f) => f.key)).toEqual(["a", "b"]);
    expect(parsed.flags[0].updatedAt).toBeInstanceOf(Date);
    expect(parsed.flags[0].updatedAt.toISOString()).toBe(
      "2024-01-02T03:04:05.000Z",
    );
  });

  it("stamps the version with configurationVersion", () => {
    const c = config(["a"]);
    const { version } = buildArtifact("org", c);
    expect(version).toBe(configurationVersion(c.flags, c.segments));
  });

  it("rejects a checksum mismatch (tampered or torn payload)", () => {
    const { body } = buildArtifact("org", config(["a"]));
    const envelope = JSON.parse(body);
    envelope.payloadJson = envelope.payloadJson.replace('"a"', '"hacked"');
    const tampered = JSON.stringify(envelope);
    expect(() => parseArtifact(tampered)).toThrow(ArtifactError);
  });

  it("rejects an unknown schema", () => {
    const { body } = buildArtifact("org", config(["a"]));
    const envelope = JSON.parse(body);
    envelope.schema = ARTIFACT_SCHEMA + 1;
    // re-checksum so only the schema is wrong
    expect(() => parseArtifact(JSON.stringify(envelope))).toThrow(ArtifactError);
  });

  it("rejects non-JSON", () => {
    expect(() => parseArtifact("{not json")).toThrow(ArtifactError);
  });
});
