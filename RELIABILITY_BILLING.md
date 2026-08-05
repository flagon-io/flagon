# Reliability (Incidents + On-call) — Billing Model Plan

> Working doc to decide how we monetize the reliability product. Nothing here is wired into Stripe yet. Delete once we've locked the decisions at the bottom.

## TL;DR recommendation

Monetize reliability as a **per-responder seat** add-on, where a "responder" is **a person you actually put on-call — not every member**. Seats fund the product; the genuinely expensive stuff (SMS/voice) is **cost-passthrough, paid-plans-only, and metered**; the free tier is **email-only with hard caps** so it can't cost us real money. This sits *alongside* the existing exposure meter (flags/experiments are usage-billed; reliability is seat-billed) — different products, different natural units.

---

## Your two questions, answered directly

### 1. "Any person could be on-call — how does billing work for members that aren't on-call?"

**Members are not billable. Responders are.** Having a login/seat in the org costs nothing for reliability. A user only becomes a billable **responder** in a month if you actually wire them into the response path:

- they're a member of an **on-call schedule** (a rotation), **or**
- they're a **user target of an escalation policy** (directly, or via a team/schedule that a policy points at).

So a PM, a designer, or an exec who has console access but is never on a rotation and is never an escalation target = **$0**. This is the same definition incident.io and FireHydrant use ("responders" / "on-call users"), and it's the fair line: you pay for the people who can get paged at 3am, not for everyone with an account.

**Deliberate nuance — ad-hoc responders stay free.** Someone who jumps into an incident (posts an update, acks, gets assigned an action item) but is **not on any schedule or policy** does **not** add a seat. Reason: we never want a price surprise to discourage people from helping during an incident. You get billed for who you *provision* to be on-call, not for who pitches in. (This is a decision to confirm — see Open Decisions.)

That gives a clean mental model for a buyer: **"I pay per person I put on a rotation or an escalation policy."**

### 2. "Depends on cost scaling — I don't want Hobby folks costing me a ton."

Right instinct, and the answer is that **seats are not the cost driver — notifications are.** Here's what a responder/incident actually costs us:

| Cost | Marginal cost | Notes |
|---|---|---|
| Compute + DB | ~$0 | Incidents/schedules are tiny rows; the escalation cron is cheap. |
| **Email paging** | fractions of a cent/send (Resend) | Cheap, but not zero at abusive volume. |
| **SMS paging** (future) | ~$0.008/msg US (Twilio) + number rental | **Real cost.** A relentless escalation can fire many messages. |
| **Voice paging** (future) | ~$0.013/min + number rental | **Real cost.** |
| Storage | ~$0 | Timeline/RCCA text is tiny. |

So **today (email-only) the per-seat marginal cost is near zero** — the risk isn't seats, it's notification volume on expensive channels. That's precisely what protects us from Hobby abuse, *if we design the free tier around it*:

- **Hobby = email-only.** SMS/voice (the only things that cost real money) are **paid-plans-only.** A free user literally cannot run up a Twilio bill.
- **Hard caps on Hobby**: e.g. ≤3 responders, 1 schedule, 1 escalation policy (no repeat), and a **monthly page-count cap** as a backstop against email abuse.
- On paid plans, SMS/voice are **metered with an included allotment + overage** (reuse the durable events meter), so a customer paging 10,000 SMS pays for those 10,000 SMS. Cost scales *with the plan that's paying for it.*

Net: **a free org can never cost us more than cheap email at a capped volume.** The moment someone wants the expensive channels, they're on a paid plan that meters them.

---

## What counts as a billable responder (precise definition)

A **responder seat** for org O in month M = a distinct user who, at any point in M, was **either**:

1. a row in `oncall_schedule_members` for any schedule in O, **or**
2. the target of an `oncall_escalation_levels` row in O where `target_type = 'user'` (directly), **or**
3. *(decision)* a member of a team/schedule that an escalation policy in O points at (`target_type in ('team','schedule')`).

Measured as a **month high-water mark** (the set's size at any point in the period), so removing someone late in the month still counts for that month — standard for seat billing and avoids gaming.

**Not** counted: ad-hoc incident actors (declared/acked/assigned) who are not on any schedule or policy. (Confirm in Open Decisions.)

---

## Proposed tiers (numbers are a starting point — your call)

| | **Hobby** (free) | **Pro** | **Enterprise** |
|---|---|---|---|
| Responders | up to **3** | **5 included**, then **~$10/responder/mo** | contract |
| Schedules | 1 | unlimited | unlimited |
| Escalation policies | 1 (no repeat) | unlimited (+ repeat) | unlimited |
| **Paging channels** | **email only** | email **+ SMS/voice (metered)** | all + dedicated routing |
| Runbooks / RCCA | basic | full | full + custom templates |
| Page-volume guard | **hard monthly cap** | included allotment + overage on SMS/voice | contract |
| Analytics (MTTA/MTTR) | — | ✓ | ✓ + export |

- **Per-responder price**: **~$10/responder/mo** is the sweet spot — clearly undercuts PagerDuty (~$21) and Opsgenie, while being real revenue. Adjust to your target margin once we model expected SMS overage.
- Reliability responders are billed **on top of** the platform (a customer on Pro for flags still adds reliability seats if they use on-call).

### For reference — how the category prices

| Vendor | Model | Rough price |
|---|---|---|
| PagerDuty | per user/mo | $21 (Pro) – $41 (Business) |
| Opsgenie | per user/mo | $9 – $29 |
| incident.io | per responder/mo | ~$20–30 |
| FireHydrant | per seat, free tier | seat-based, generous free |
| UptimeRobot | **per monitor** (different category — uptime monitoring, not incident response) | tiered by monitor count |

The whole incident/on-call category is **per-responder seat**. UptimeRobot's per-monitor model is a different product (synthetic uptime checks) and isn't the right analogue for us.

---

## Metering & enforcement (how we'd build it)

**Metering (seats):**
- A monthly rollup computes each org's responder set (the union above) and its size.
- Report the count to a Stripe **per-seat subscription item** on a reliability add-on (update `quantity`), or a licensed/metered item. This is simpler than the exposure meter — it's a monthly quantity, not a high-frequency event stream. Reuse the reconcile/settlement plumbing we already have.

**Metering (SMS/voice, when those channels land):**
- Emit a durable `usage_event` per message sent (we already have the immutable events meter + idempotency + exactly-once compaction). Included allotment per plan, overage billed at cost-plus.

**Enforcement (the Hobby guard):**
- At write time: block adding a 4th responder / 2nd schedule / enabling SMS on Hobby (mirror how plan gating already works for other Pro features).
- The monthly page-count cap is checked in the notify path; over the cap, drop to a digest or stop (with a clear "upgrade" signal).

**Existing hooks:** billing is LIVE on Stripe (flat Pro + exposure meter, with settlement-on-delete). Adding a reliability seat item is additive; the `flagon_plan` marker + webhook pattern from enterprise provisioning is the template.

---

## Open decisions (need your call before any Stripe wiring)

1. **Responder definition** — provisioned (on a schedule or a user-target of a policy) [recommended] vs. also counting anyone who actually responded.
2. **Team/schedule escalation targets** — does pointing a policy at a *team* make all its members billable responders, or only those separately on a schedule? (Recommend: team-target *does* expand to its members as seats, since you've made them pageable.)
3. **Per-responder price + free allotment** — ~$10/responder, 5 included in Pro, 3 free on Hobby? (Tune to margin.)
4. **Hobby caps** — responders (3?), schedules (1?), policies (1, no repeat?), monthly page cap (?).
5. **SMS/voice economics** (deferred until channels exist) — included allotment per plan + overage rate.
6. **Packaging** — reliability seats as a standalone add-on line item, or folded into a higher platform tier?

Once 1–4 are decided, the seat meter + Hobby enforcement is a contained build on top of the existing billing pipeline.
