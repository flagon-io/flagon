import { Hono } from "hono";
import { health } from "./health.route.js";
import { waitlist } from "./waitlist.route.js";

export const v1 = new Hono();

v1.route("/health", health);
v1.route("/waitlist", waitlist);
