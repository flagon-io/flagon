import { Hono } from "hono";
import { healthz } from "./healthz.route.js";
import { me } from "./me.route.js";
import { flags_ } from "./flags.route.js";
import { clientKeys_ } from "./client-keys.route.js";
import { segments_ } from "./segments.route.js";
import { environments_ } from "./environments.route.js";
import { members_ } from "./members.route.js";
import { billing_ } from "./billing.route.js";
import { orgLifecycle_ } from "./org-lifecycle.route.js";
import { usage_ } from "./usage.route.js";
import { org_ } from "./org.route.js";
import { security_ } from "./security.route.js";
import { orgTokens_ } from "./tokens.route.js";
import { emailVerify_ } from "./emails.route.js";
import { projects_ } from "./projects.route.js";
import { teams_ } from "./teams.route.js";
import { uploads_ } from "./uploads.route.js";
import { experiments_ } from "./experiments.route.js";
import { experimentMetrics_ } from "./experiment-metrics.route.js";
import { holdouts_ } from "./holdouts.route.js";
import { incidents_ } from "./incidents.route.js";
import { runbooks_ } from "./runbooks.route.js";
import { rcca_ } from "./rcca.route.js";
import { severityLevels_ } from "./severity-levels.route.js";
import { objectives_ } from "./objectives.route.js";
import { integrations_ } from "./integrations.route.js";
import { managementWriteLimit } from "../../lib/management-rate-limit.js";

export const v1 = new Hono();

v1.route("/healthz", healthz);
v1.route("/me", me);
// Public (token-authed) secondary-email confirmation link target.
v1.route("/email/verify", emailVerify_);

// Org-scoped management surface: /v1/orgs/:org/*. The console and org-token API
// consumers manage the flags product here; each handler authorizes the org and
// works inside withOrg() so RLS enforces tenancy at the database.
const orgs = new Hono();
// Throttle authenticated writes across the whole org surface before any handler
// runs. The pattern captures :org so the limit is keyed per (org, caller).
orgs.use("/:org/*", managementWriteLimit);
orgs.route("/:org/flags", flags_);
orgs.route("/:org/client-keys", clientKeys_);
orgs.route("/:org/segments", segments_);
orgs.route("/:org/environments", environments_);
orgs.route("/:org/members", members_);
orgs.route("/:org/billing", billing_);
orgs.route("/:org/lifecycle", orgLifecycle_);
orgs.route("/:org/usage", usage_);
orgs.route("/:org/tokens", orgTokens_);
orgs.route("/:org/projects", projects_);
orgs.route("/:org/teams", teams_);
orgs.route("/:org/uploads", uploads_);
// Experiments and their reusable metric definitions. `experiment-metrics` is a
// sibling resource (not nested under /experiments) so it never collides with an
// experiment key, and its own namespace keeps these clear of future OTEL metrics.
orgs.route("/:org/experiments", experiments_);
orgs.route("/:org/experiment-metrics", experimentMetrics_);
orgs.route("/:org/holdouts", holdouts_);
// Reliability: incidents + their runbooks.
orgs.route("/:org/incidents", incidents_);
orgs.route("/:org/runbooks", runbooks_);
orgs.route("/:org/rcca-template", rcca_);
orgs.route("/:org/severity-levels", severityLevels_);
orgs.route("/:org/objectives", objectives_);
// Organization security: SSO enforcement, required 2FA, SCIM provisioning.
orgs.route("/:org/security", security_);
// Bring-your-own-provider integrations (Twilio, …): customer-supplied
// credentials Flagon uses on their behalf. Slack/Discord app-installs are separate.
orgs.route("/:org/integrations", integrations_);
// The org resource itself (PATCH /:org rename). Registered last so the more
// specific sub-resource routes above take precedence.
orgs.route("/:org", org_);
v1.route("/orgs", orgs);
