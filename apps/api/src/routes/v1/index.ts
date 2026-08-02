import { Hono } from "hono";
import { healthz } from "./healthz.route.js";
import { waitlist } from "./waitlist.route.js";
import { contact } from "./contact.route.js";
import { me } from "./me.route.js";
import { flags_ } from "./flags.route.js";
import { sdkKeys_ } from "./sdk-keys.route.js";
import { segments_ } from "./segments.route.js";
import { environments_ } from "./environments.route.js";
import { members_ } from "./members.route.js";
import { billing_ } from "./billing.route.js";
import { usage_ } from "./usage.route.js";
import { org_ } from "./org.route.js";
import { orgTokens_ } from "./tokens.route.js";
import { emailVerify_ } from "./emails.route.js";
import { projects_ } from "./projects.route.js";
import { teams_ } from "./teams.route.js";
import { uploads_ } from "./uploads.route.js";
import { managementWriteLimit } from "../../lib/management-rate-limit.js";

export const v1 = new Hono();

v1.route("/healthz", healthz);
v1.route("/waitlist", waitlist);
v1.route("/contact", contact);
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
orgs.route("/:org/client-keys", sdkKeys_);
orgs.route("/:org/segments", segments_);
orgs.route("/:org/environments", environments_);
orgs.route("/:org/members", members_);
orgs.route("/:org/billing", billing_);
orgs.route("/:org/usage", usage_);
orgs.route("/:org/tokens", orgTokens_);
orgs.route("/:org/projects", projects_);
orgs.route("/:org/teams", teams_);
orgs.route("/:org/uploads", uploads_);
// The org resource itself (PATCH /:org rename). Registered last so the more
// specific sub-resource routes above take precedence.
orgs.route("/:org", org_);
v1.route("/orgs", orgs);
