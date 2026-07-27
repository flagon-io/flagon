import { Hono } from "hono";
import { healthz } from "./healthz.route.js";
import { waitlist } from "./waitlist.route.js";
import { me } from "./me.route.js";

export const v1 = new Hono();

v1.route("/healthz", healthz);
v1.route("/waitlist", waitlist);
v1.route("/me", me);
