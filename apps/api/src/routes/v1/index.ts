import { Hono } from "hono";
import { healthz } from "./healthz.route.js";
import { waitlist } from "./waitlist.route.js";
import { me } from "./me.route.js";
import { flags_ } from "./flags.route.js";
import { sdkKeys_ } from "./sdk-keys.route.js";
import { segments_ } from "./segments.route.js";
import { entities_ } from "./entities.route.js";
import { environments_ } from "./environments.route.js";
import { members_ } from "./members.route.js";

export const v1 = new Hono();

v1.route("/healthz", healthz);
v1.route("/waitlist", waitlist);
v1.route("/me", me);

// Org-scoped management surface: /v1/orgs/:org/*. The console and org-token API
// consumers manage the flags product here; each handler authorizes the org and
// works inside withOrg() so RLS enforces tenancy at the database.
const orgs = new Hono();
orgs.route("/:org/flags", flags_);
orgs.route("/:org/sdk-keys", sdkKeys_);
orgs.route("/:org/segments", segments_);
orgs.route("/:org/entities", entities_);
orgs.route("/:org/environments", environments_);
orgs.route("/:org/members", members_);
v1.route("/orgs", orgs);
