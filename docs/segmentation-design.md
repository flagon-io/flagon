# Segmentation Design for a Custom OpenFeature Provider

> **Status: design brief, not yet implemented.** Today Flagon segments are
> project-scoped, rule-only (a `Condition` over context), reused across a
> project's environments but **not across projects**, and resolved entirely
> in-process at publish time (compiled into the env bundle). This document
> captures where we want to take segmentation and the open questions to settle
> first. The immediate itch driving it: not being able to reuse a segment across
> projects feels wrong. See "Proposed scoping" and "Questions for the reviewer".

## Purpose of this document

This is a design brief for how segmentation should work in a custom feature-flag
provider implemented against the OpenFeature spec. It captures the problem space,
a proposed architecture, the tradeoffs behind each decision, and the open
questions still worth debating. It is written to be picked up cold by a reviewer
who has not seen the prior discussion. Where a decision is proposed rather than
settled, it is marked as such.

The reviewer is explicitly invited to push back. See the "Questions for the
reviewer" section at the end.

## Background: where segmentation sits in OpenFeature

OpenFeature is a vendor-neutral specification and SDK for *evaluating* feature
flags. It standardizes the evaluation API, the evaluation context, providers,
and hooks. It deliberately leaves flag definition, management, and targeting to
the backend. There is no "segment" or "project" primitive anywhere in the spec.
The closest concepts are the "flag set" (an organizational grouping of flags)
and generic "targeting" (rules and fractional evaluation applied during
resolution), both driven by the evaluation context the caller passes in.

The practical consequence: a provider author owns the segmentation model
entirely. OpenFeature will not constrain it. The provider decides what a segment
is, how it is scoped, and how it is evaluated, then expresses the result through
targeting rules evaluated against the context.

## The core distinction: two kinds of segment

Every segment falls into one of two tiers, and the tier determines how it can be
evaluated. This distinction drives the rest of the design.

**Rule-based segments** are pure predicates over evaluation-context attributes,
for example `plan == "enterprise" AND country IN ["US", "CA"]`. Because they are
pure functions of context that the caller already holds, their definitions can be
shipped to the SDK and evaluated locally with zero network round trip. Fast,
context (including any PII) stays in-process, and they keep working under network
partition.

**Data-backed segments** (LaunchDarkly calls these "big segments") are membership
sets that cannot ride along as a predicate, for example "the 2M user IDs in this
uploaded list" or "anyone who churned in the last 30 days." Membership lives in a
side store and has to be looked up at evaluation time, either by the SDK querying
the store or by a narrow server-side call.

Presenting these as one concept to end users is fine. Modeling them as one row
shape internally is not, because their evaluation paths differ.

## Proposed architecture

### 1. Segments are first-class, named, reusable entities

A segment is a saved targeting expression (or membership reference) with a stable
key. Flags reference segments by key. Inline conditions on a flag are acceptable
as syntactic sugar, but the named segment is the primitive. Reuse is the entire
reason segments exist; without named reuse, the same predicate gets copy-pasted
across many flags with no way to update them together.

### 2. Resolution strategy is a property of the segment, not a global mode

Each segment declares how it resolves. Flag evaluation is then uniform regardless
of deployment: walk the targeting rules, and when a segment reference is hit,
dispatch to the resolver that segment declares.

- `rule` segments resolve inline and locally, always. Pure predicate over context.
- `list` / data-backed segments resolve out of process: SDK-side store lookup
  keyed by targeting key, or a narrow RPC for just that membership decision.

This is the key move that makes "support both evaluation modes" tractable. The
fast local path is the default for everything that can ship; only membership that
genuinely cannot be carried goes remote.

### 3. Support both in-process and RPC evaluation

Default to in-process: the provider pulls flag and segment config, evaluates
locally, and a streaming channel pushes config updates for hot reload (SSE,
gRPC stream, or a LISTEN/NOTIFY-driven registry; any push channel works). Add an
RPC / edge-evaluation path for the data-backed segments that cannot be shipped.
flagd is the reference implementation of exactly this dual mode and is worth
studying before committing to a wire format, because it keeps the same flag
definition evaluable in both modes.

## The hard part: evaluation parity

"Support both modes" is the easy decision. Keeping both paths returning the same
answer is where the real cost lives, and it should be named up front.

The moment a single flag can be resolved by local code in several SDK languages
*and* by a server, there are N+1 copies of the evaluation algorithm that must
agree byte-for-byte: identical expression semantics, identical null and
missing-attribute handling, identical type coercion, and identical bucketing. If
one SDK buckets a user into variant A locally while the server buckets the same
user into variant B, the result is nondeterministic behavior that depends on
which path happened to serve the request. That class of bug is miserable to
debug.

This is the actual reason flagd standardized on JsonLogic: a single portable
evaluation spec that every language implements identically. It is not that
JsonLogic is semantically richer than the alternatives; it is that it travels.

**The load-bearing artifact is a conformance test-vector suite.** Specify the
evaluation algorithm once, in prose plus a suite of input/output vectors, and
require every implementation (server and each SDK) to pass the identical suite.
Those vectors are the contract that keeps the paths honest. Without them, parity
rots silently as implementations drift.

> Flagon note: we already have a TS engine (`src/core`) with a conformance
> fixture set (`src/core/evaluate.test.ts`). That is the seed of this suite; the
> Go data plane and any SDK-local path must run the same vectors.

### Bucketing must be pinned to the byte level

Segment membership gates *eligibility*. Variant assignment is a separate,
deterministic step. Keep them orthogonal: the segment decides who is eligible,
then a deterministic hash assigns the variant.

The bucketing function has to be specified exactly: the precise byte
concatenation, the hash, and the modulus. A concrete proposal:

```
bucket = murmur3_32(salt + ":" + targetingKey) % 100000
```

Store the salt per flag so a flag can be reshuffled without disturbing the
bucketing of any other flag. Whatever the final choice, it must be one of the
conformance vectors, because bucketing is the single most likely place for the
two evaluation paths to silently disagree.

## Expression language: the one genuinely open tradeoff

The choice is reach within a single ecosystem versus portability across many.

- **CEL** (Common Expression Language): typed, sandboxed, fast, mature Go
  tooling. Excellent for server-side and Go-based sidecar evaluation. The cost is
  that shipping CEL into JS / Swift / Kotlin SDKs for *local* evaluation is rough.
- **JsonLogic**: weaker semantics, but trivially portable to every SDK language.
  This is why flagd chose it.

Heuristic: if SDKs evaluate locally across many languages, JsonLogic. If
evaluation is Go-centric or server-side, CEL. A hybrid is possible (CEL on the
server, a JsonLogic subset shipped to SDKs) but a hybrid doubles the conformance
surface, so it should be a deliberate choice, not a default.

> Flagon note: our current `Condition` type is a small custom tree, not
> JsonLogic or CEL. If we want SDK-local evaluation later, we either adopt a
> portable language or commit hard to the conformance-vector discipline for our
> own tree.

## The bills that come with "both"

Two costs come bundled with supporting the remote tier. Surfacing them now avoids
retrofitting later.

**Staleness and failure policy for the remote tier.** The data-backed path needs
a cache policy: TTL, negative caching, and defined behavior when the store or RPC
is unavailable. A flag evaluation should never hard-fail. Big-segment systems
almost always define "store down" as a deterministic fallback (treat as
not-a-member, or serve last-known) rather than throwing. This fallback should be
explicit and configurable per flag, not implicit.

**Format portability across modes.** The wire format and the config format should
be identical, so a single flag definition evaluates in-process or via RPC with no
rewriting. This portability is most of flagd's value. It is cheap to preserve if
designed in from the start and expensive to retrofit.

## Illustrative schema

This is illustrative to make the dispatch concrete, not a finalized wire format.

```json
{
  "segments": {
    "enterprise-us": {
      "resolutionStrategy": "rule",
      "expression": {
        "and": [
          { "==": [ { "var": "plan" }, "enterprise" ] },
          { "in": [ { "var": "country" }, ["US", "CA"] ] }
        ]
      }
    },
    "beta-cohort": {
      "resolutionStrategy": "list",
      "store": {
        "type": "redis-set",
        "ref": "segments:beta-cohort",
        "ttlSeconds": 60,
        "onUnavailable": "not-member"
      }
    }
  },

  "flags": {
    "new-dashboard": {
      "state": "ENABLED",
      "variants": { "on": true, "off": false },
      "defaultVariant": "off",
      "targeting": {
        "rules": [
          {
            "if": { "inSegment": "enterprise-us" },
            "then": {
              "rollout": {
                "salt": "new-dashboard",
                "buckets": [
                  { "variant": "on",  "weight": 50000 },
                  { "variant": "off", "weight": 50000 }
                ]
              }
            }
          },
          {
            "if": { "inSegment": "beta-cohort" },
            "then": "on"
          }
        ]
      }
    }
  }
}
```

Evaluation flow for `new-dashboard`:

1. Evaluate rules top to bottom.
2. Rule 1 references `enterprise-us`, a `rule` segment, so evaluate its expression
   locally against the context. If it matches, run the deterministic rollout and
   return the bucketed variant.
3. Rule 2 references `beta-cohort`, a `list` segment, so dispatch to the store
   lookup keyed by targeting key. On a hit, return `on`. If the store is
   unavailable, apply `onUnavailable: not-member` and fall through.
4. No rule matched, so return `defaultVariant`.

## Proposed scoping (open to challenge)

Define segments at the project level as a single source of truth, reusable across
environments, with per-environment overrides only for membership where needed.
The alternative (recreating segments per environment) duplicates definitions and
invites drift. This mirrors how most commercial backends scope segments to a
project, sometimes further narrowed by environment.

> Flagon note: this is roughly where we already are (project-scoped, reused
> across environments). The live tension is whether segments should *also* be
> reusable across projects, or even org-global. See question 4.

## Questions for the reviewer

1. **Expression language.** Given the SDK language matrix this provider needs to
   support, is JsonLogic's portability worth its weaker semantics, or does a
   Go-centric / server-side evaluation model justify CEL? Is the hybrid worth its
   doubled conformance surface?
2. **Conformance strategy.** Is a hand-authored vector suite sufficient, or
   should the evaluation algorithm be generated from a single source so SDKs
   cannot drift? How is the bucketing function locked down and versioned?
3. **Remote-tier failure semantics.** Is per-flag `onUnavailable` the right
   granularity, or should fallback be a provider-level policy? What is the
   default when unspecified?
4. **Scoping.** Is project-level segment definition with per-environment
   membership override the right model, or is there a case for environment-scoped
   or globally-scoped (org-wide, reusable across projects) segments as
   first-class options?
5. **Anything missing.** Is there a third segment tier worth modeling (for
   example, computed/streaming segments that are neither static lists nor pure
   context predicates), and does the resolution-strategy field generalize to it?
