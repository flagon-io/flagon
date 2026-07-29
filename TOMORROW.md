Resume Flagon launch work. Read `.notes/launch-plan.md` first — it's my git-ignored plan from last night with full context (also check your memory for the RLS/node-24/cookie gotchas).

Status: pushed to production and deployed last night. Platform is vetted green (browser + API + 89/89 tests under the restricted RLS role). Three launch-breaking bugs are already fixed and shipped.

Today, in order:
1. Run Part 1 of the plan — confirm the prod deploy is healthy (Vercel green on node 24, CI green, web sign-in working, a real prod smoke: create flag → SDK key → OFREP eval against api.flagon.io, Sentry test error, prod DB-role check). Flag anything broken.
2. Then start Part 2 — implement flat $20/mo Pro billing via Stripe (NO usage metering yet): Stripe SDK, subscription columns on organizations, Checkout on upgrade (replacing the free plan self-grant at apps/app/src/app/[org]/settings/actions.ts:50-53), webhook, billing settings page. Lead with the landmine that Pro is currently free and self-granted.

I currently have a stripe customer in production that represents flagon, and its subscription and coupons/discounts that I need to account for, so help me ensure the existing org is accounted for.

Hard deadline: I onboard my first client at 5:00pm MST today — onboarding does NOT depend on billing being finished (I'll set the client to Pro manually), so prioritize confirming prod is solid, then make as much billing progress as possible.

Reminder: never git commit/push — I commit everything myself. Local dev + tests run as the restricted role (APP_DATABASE_URL=flagon_app). Start by reading the plan and telling me the prod-validation results.
