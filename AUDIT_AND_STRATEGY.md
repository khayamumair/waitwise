# WaitWise: Audit & Growth Strategy

_Full repo audit, NHS market context, and a POC → company plan. Generated 2026-07-17._

---

## 1. What was fixed (2026-07-17)

### Live site bugs (the deployed page was visibly broken)
- **Team photos broken on the live site.** Code requested `team-hackathon.jpg` / `team-ai-summit.jpg` but files were saved as `.jfif`, so visitors saw "Save the photo as…" placeholder boxes. Converted both to compressed `.jpg` (5.9 MB → 0.8 MB total).
- **Mobile had no navigation.** Below 880px every nav link vanished. Added a hamburger menu.
- **Footer contact form threw away the visitor's email.** Opened a blank mailto and ignored input. Now includes their address in the email body; field is `required`.
- **Contact address pointed at `hello@waitwise.health`**, a domain you don't own, so "Get in touch" went nowhere. Pointed at Gmail with a TODO to swap once waitwise.co.uk is live.
- **Removed the `®`** from the wordmark, using ® on an unregistered trademark is an offence under s.95 of the UK Trade Marks Act. Use ™ or nothing until registered.
- **Softened "Backed by the UK Government"** to "Supported by…", "backed" implies investment; NHS diligence teams check.
- Mobile polish: tighter padding on small screens, responsive stat numbers, no horizontal scroll, wrap-safe footer form, `prefers-reduced-motion`, visible focus outlines, lazy-loaded images, alt text.
- SEO/social: added `og:image`, Twitter card, canonical URL, theme-color.
- Deleted stale committed `dist-preview/` build and gitignored it; rebuilt `docs/`.

### Backend bugs
- **Approve bug:** `POST /approve/{triage_id}` set *every* communication in the whole scan to "approved", not just that patient's. In production that's letters going out without review, the exact failure mode of the scrapped NHS pilot. Fixed to filter by patient.
- **Docs/data mismatch:** coordinators in the data are `CO001`/`CO002` (Sarah Mensah, Tom Bradley) but the API default and README said `COORD001` (Sarah Obinna), following the docs got a 403. Fixed defaults + docs.
- Backend README told people to flip `MOCK_LLM = False` inside agent files, stale since `llm_config.py` exists. Updated to the env-var flow.

---

## 2. Audit: what's still open (prioritised)

The codebase is genuinely good for a hackathon: clean separation (monitor/triage/communication), honest fallback warnings when the DGX is unreachable, deterministic mock mode, real tests. These findings are about the gap between "demo" and "thing a trust can touch."

### Security: fine with synthetic data, blockers before any real data
1. **No authentication anywhere.** `coordinator_id` in the request body is the only "identity", anyone who can reach the API can scan, read all patients, approve letters, and read/write the audit trail.
2. **`/v1/chat/completions` is an open, unauthenticated LLM proxy.** Must be public for ElevenLabs, so anyone who finds the URL gets free Nemotron inference and can saturate the GPU mid-demo. ElevenLabs custom-LLM supports a secret header; require one.
3. **`/voice/postcall` doesn't verify the webhook signature.** ElevenLabs signs post-call webhooks (HMAC); right now anyone can inject fake "CONDITION WORSENED" audit records.
4. **CORS is `allow_origins=["*"]`** with all methods/headers.
5. **SQL injection pattern:** patient IDs are f-string-interpolated into `IN (...)` clauses (`api.py`, `monitor.py`). Not exploitable today (IDs come from your own DB), but it's the habit that bites the day IDs come from user input. Parameterise.
6. **Audit trail is spoofable and not durable.** `POST /audit` is open, the in-memory list is lost on restart (JSONL survives but isn't re-read), nothing makes it tamper-evident. For NHS, an append-only, hash-chained audit log is a selling point, build it properly.
7. `/results` returns the full Python traceback to the client on failure; the voice agent also states the patient's condition before verifying who answered the phone, a clinical-confidentiality issue to fix before any live calls.

### Reliability / architecture debt
- Scan state (`_active_runs`, cohort queue/summary, escalation queue, `EVENT_QUEUES`) is all in-memory: restarts lose results, memory grows forever, two scans in the same second collide (timestamp-based scan IDs).
- No CI. Tests exist but nothing runs them, add GitHub Actions (`pytest` in mock mode + `npm run build`). An afternoon, and the first thing technical diligence looks for.
- Repo hygiene: **no LICENSE file** (legally "all rights reserved", likely conflicts with the Mozilla open-source grant; decide Apache-2.0 vs AGPL deliberately), a 64 MB demo video and the built DuckDB committed to git, no `.env.example`, no Dockerfile, frontend has both `package-lock.json` and `pnpm-lock.yaml` (pick one).

---

## 3. NHS market context

**The "scrapped pilot / false removal" story is real, and it's your best marketing asset.** NHS England paid trusts ~£33 per patient removed via waiting-list "validation" (£18.8M over six months, ~567,000 removals). In January 2026 alone 250,000+ patients were removed, including people who simply didn't answer a text message. The Nuffield Trust and Healthwatch publicly criticised it; by July commentators called the resulting drop an "illusion." So the money, the political attention, and a burnt-trust cautionary tale all exist in exactly your problem space.

**Pitch:** validation done crudely removes real patients; WaitWise is the safety layer that finds the people the system is quietly dropping, human-approved, fully audited, data never leaving the trust. You are not "another AI that touches the waiting list"; you're the answer to the failure everyone just read about. (The approve-all bug is why the audit trail and human-in-the-loop claims must be engineering realities, not slides.)

**Incubators/accelerators:**
- **NHS Innovation Accelerator (NIA):** 2026 cohort closed; **2027 intake opens 17 August 2026** (~a month away). Wants evidence-backed innovations, you may be a year early.
- Nearer-term fits: **DigitalHealth.London Accelerator**, **KQ Labs** (Crick, health-data startups, 2026 applications open), **SBRI Healthcare** competitions, **NIHR i4i** (needs a clinical partner).
- The government "AI incubator" is **i.AI (ai.gov.uk)**, and you *already have* i.AI mentoring through the Builder Pack. Warm channel most startups would kill for; use it to get introduced to an ICB or trust transformation team.

**Sources:**
- NIA 2026/2027 dates: https://innovation.nhs.uk/news/apply-now-for-the-nhs-innovation-accelerator-nia-2026-cohort/
- NHS accelerates AI rollout (July 2026): https://www.england.nhs.uk/2026/07/nhs-accelerates-artificial-intelligence-rollout-to-cut-waiting-times-and-improve-care-for-millions/
- LBC on waiting-list removals: https://www.lbc.co.uk/article/nhs-removing-patients-waiting-lists-labour-backlog-5HjdWNB_2/
- Daily Sceptic on validation removals: https://dailysceptic.org/2026/07/13/the-nhs-waiting-list-illusion-is-over/
- Deep Medical pilot expansion: https://pharmaphorum.com/news/nhs-will-expand-use-waiting-list-busting-ai-after-pilot
- KQ Labs: https://www.innovatorsmag.com/applications-open-for-kq-labs-2026-health-innovation-accelerator/
- i.AI: https://ai.gov.uk/

---

## 4. POC → company plan

### Weeks 1–2 (~£2.5k of the £10k): make it a company
Register Waitwise Ltd, buy waitwise.co.uk (+ .com/.health if cheap), file the UK trademark (~£170–370), founders' agreement with **IP assignment into the company** (right now the code is personally owned by whoever wrote it, check the hackathon T&Cs too), pick the open-source licence, add LICENSE + CI. Don't hire anyone.

### The strategic decision to make early: regulatory classification
Software that triages/prioritises patients plausibly qualifies as **Software as a Medical Device (SaMD)** under UK MDR, even with a human in the loop. The "read-and-recommend overlay" framing helps but doesn't auto-exempt you. Get an hour with a regulatory consultant (~£1k well spent) and recruit a **clinical advisor who can act as Clinical Safety Officer**, you need one for DCB0129, and a clinician's name changes how every NHS door opens.

Compliance stack to sequence: **DTAC → DSPT → DCB0129 → Cyber Essentials Plus → (later) ISO 27001.** Your on-device/DGX story is a genuine differentiator, most competitors are cloud SaaS fighting IG battles you don't have.

### The £500k compute grant: spend it on evidence, not features
NHS buyers buy evidence. Highest-value use of 20,000 GPU hours is an **evaluation harness**:
- Benchmark triage accuracy against clinician-panel labels on synthetic (later pseudonymised real) pathway data.
- Measure hallucination rates in generated letters.
- Compare 4B vs 70B on-prem cost/accuracy so you can tell a trust exactly what hardware they need.
- Red-team the voice agent.

A published "we measured our false-flag and missed-patient rates, here they are" report is worth more than any feature, **especially** given the false-removal scandal. False-removal rate is literally the metric the news story was about.

### Route to first pilot: shadow mode
Ask one trust's PTL/validation team (via i.AI, DigitalHealth.London, or a Health Innovation Network) to run WaitWise *read-only* alongside their existing process, it flags, their staff compare, no patient is contacted. Minimal governance burden; generates your evidence base and first case study. Engineering needed first: real auth, Postgres for state, durable audit log, FHIR/e-RS adapter layer (design the interface now, implement per-pilot).

### Money
The £10k is runway for admin, compliance advice, and travel, not salaries. Raise a proper pre-seed (£300–500k, healthtech angels + Nina Capital/KHP Ventures-type funds) *after* a pilot LOI. "Hackathon winners with government compute, a clinical advisor, and a trust running shadow mode" is fundable; "hackathon winners" alone is not. Revenue model: per-trust annual licence (trusts already pay per-patient for validation, £33 × 567k shows the budget exists), with the on-prem appliance as the premium tier.

### Website next iterations (once domain is live)
Move off github.io to waitwise.co.uk; add founder names/faces with LinkedIn (NHS buyers buy from people); a "For NHS teams" page speaking DTAC/DSPT/DCB0129 language; a privacy policy; Plausible analytics (cookie-free, no banner).

### The one thing to do this week regardless
Register the company and domain, and email your i.AI contact asking for an introduction to a trust elective-recovery team. Everything else compounds from there.
