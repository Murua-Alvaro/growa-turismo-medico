# Growa Intelligence v0.5 — architecture, operations and audit

> Implementation status: integration in GitHub source. The Render demo uses an ephemeral
> SQLite database; it does not process real patient records or confirm outside bookings.

## 1. Four open-source integrations

| Component | Source | License | Integration | Operating mode |
|---|---|---|---|---|
| Google OR-Tools CP-SAT | https://github.com/google/or-tools | Apache-2.0 | `app/optimizer.py` | Installed through `requirements.txt`. Solver has 0.35s deadline and 180-candidate cap; deterministic fallback. |
| Valhalla | https://github.com/valhalla/valhalla | MIT | `app/routing.py` | API adapter, disabled until a trusted HTTPS `ROUTING_BASE_URL` is set. Straight-line distance shown honestly without road ETA. |
| pgvector | https://github.com/pgvector/pgvector | PostgreSQL License | `app/discovery.py` | Optional `VECTOR_SEARCH_ENABLED=true` on PostgreSQL; HNSW cosine search plus deterministic lexical signals. |
| FullCalendar standard bundle 6.1.21 | https://github.com/fullcalendar/fullcalendar | MIT (standard) | `static/app.js` | Lazy-load on itinerary calendar open. No Premium Scheduler features. |

**Important distinction**: the local/contextual vectorizer is a transparent Spanish
domain-term hashing representation (96 dimensions), **not a neural embedding model**,
diagnostic inference or foundation-model AI. It runs on the API server and requires
no external inference provider. pgvector improves scalable retrieval; quality depends
on actual supplier descriptions. Do not advertise this as a clinical recommendation.

## 2. Planning and OR-Tools

The existing SQLAlchemy availability checks and row-locked booking inventory remain
the source of truth. `services.plan()` constructs candidate combinations only
from declared supplier slots and available local inventory. The new `optimizer.shortlist()`
then solves a bounded binary integer model:

- `x_i in {0,1}`, one binary decision for each feasible candidate.
- `1 <= sum(x_i) <= 8` (shortlist cap).
- At most two recommendations sharing a hotel or medical slot, and four sharing
  a transport provider, to avoid a redundant shortlist.
- Maximize weighted utility, with four modes: `balanced`, `economy`, `proximity`,
  and `comfort`. Cost, great-circle proximity and preferred-hour deviation
  are combined as an **explainable ranking heuristic**.
- Timeout 0.35s, one worker, at most 180 best candidates. Fallback deterministic
  diversified greedy strategy if solver unavailable or incomplete.

These caps diversify **recommendations**; they are not supplier capacity limits.
Capacity is independently enforced during booking. Selection is not a guarantee
of availability or an external confirmation.

API: `POST /api/plan` accepts `priority` in the four modes and returns
`optimization`, `options[].recommendation`, `options[].rank` and original
`total_feasible` count. Google FreeBusy checks (when authorized) still apply
after candidate selection. A later enhancement could reoptimize after busy filtering
to refill the shortlist; current behavior fails closed on calendar API errors.

## 3. Valhalla routing

`GET /api/route?from_id=<listing>&to_id=<listing>` accepts **only existing listing
IDs**, never arbitrary URLs or coordinates. When the operator sets
`ROUTING_BASE_URL=https://<trusted-valhalla-server>`:

- The backend sends a GET `/route?json={...}` with `costing=auto`.
- HTTPS endpoint is fixed by server configuration; no user-controlled SSRF target.
- 3.5s maximum timeout (1.6s connect), no HTTP redirect following.
- Maximum 12 new outbound routing calls/minute/process, 15 minute bounded cache
  (400 entries); safe fallback on provider error.
- Road distance in km, travel duration in minutes and optional polyline6 map shape.
- The UI shows road routing or clearly marks a dashed straight-line fallback.

**The evaluation Render service may use the rate-limited FOSSGIS Valhalla demonstration endpoint; it is for low-volume testing only.** Never send names, addresses or clinical details to the routing provider (this adapter sends only synthetic listing coordinates).\n\n**Do not use a public Valhalla demonstration server as a production SLA**. Official
public demos are rate-limited and intended for fair-use evaluation, with provider
notification requested for public applications. Deploy a dedicated Valhalla
instance or contract a routing service before user-facing scale. A routing
result is a logistics estimate and not real-time traffic.

## 4. pgvector search

`GET /api/discover?query=hotel%20accesible` uses category/accessibility/zone/
price filters from the existing catalogue. Domain aliases and deterministic
concept hashes allow Spanish contextual matching without sending sensitive
queries to external services. In PostgreSQL with `VECTOR_SEARCH_ENABLED=true`,
use normalized 96-dimensional vectors and HNSW cosine retrieval, blended with
literal token overlap.

In the dedicated Neon `growa-turismo-medico` project, `vector` extension and
the separate `growa_listing_vectors` table/HNSW index were created with
`IF NOT EXISTS`. The original eight business tables were left intact.
The table references `listings(id)` with cascading deletion. Index is synced
on startup and when an admin adds a provider. **Existing provider edits should
also call `discovery.upsert`** once such edit API is implemented.

Enabling instructions after **private Neon DATABASE_URL** is present in Render:
1. Set `PRODUCTION=true`, `DEMO_SEED=false`, `DATABASE_URL`, unique
   `SESSION_SECRET`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`.
2. Set `VECTOR_SEARCH_ENABLED=true`. Database changes are explicit and safe
   only on the dedicated project; use migration management before scale.
3. Redeploy, inspect startup logs and `GET /api/health`.
4. Run integration tests against a disposable staging branch before onboarding
   real partners. Never paste credentials into the repository or chat.

On SQLite/Render demo `VECTOR_SEARCH_ENABLED=false` and a deterministic
contextual fallback is provided.

## 5. FullCalendar

Standard MIT-licensed FullCalendar v6.1.21 is loaded lazily from a pinned CDN
when an itinerary calendar is opened; no additional JavaScript build tool or
Premium Scheduler package. The calendar shows **proposed** local appointments,
hotel nights and transportation with clear unconfirmed labels. Logged-in
coordinators may view local booking legs. It does not create appointments,
modify Google calendars or expose private provider calendars. Google Calendar
OAuth integration remains separately permissioned by the existing backend.

External CDN downtime displays an informative fallback rather than making the
page unusable. For serious operations, vendor verified assets and implement CSP
and subresource integrity controls before processing actual guest information.

## 6. Security and performance audit

- No clinical records, patient details or real provider confirmations are created.
- HTTPS routing requests are server-side and allow only known suppliers.
- CP-SAT is bounded by time, workers and candidate count; fallback is deterministic.
- SQL vector queries use bound parameters; search limit is 50 and input max 160 chars.
- Booking mutations remain behind role-based auth and CSRF and preserve supplier
  capacity checks with PostgreSQL row locks.
- The Render **Free** plan has 512 MB memory and cold-starts; monitor OR-Tools
  import memory, dependency installation, build times and restart events.
- SQLite on Free Render is ephemeral; bookings are for demonstration only.
- For production, configure PostgreSQL Neon and verify email, tokens, secrets,
  business agreements and clinic/provider authorizations.
- The visual map may need self-hosted map tiles/production usage agreements.
- Browser FullCalendar depends on a third-party CDN; pin and vendor for a
  hardened production build.
- A successful smoke test does not replace end-to-end browser testing, routing
  provider staging tests, load testing, security testing or accessible UX audit.

## 7. QA

The repository includes `tests/test_platform.py` and
`tests/test_intelligence.py`. Run in an isolated test environment:

```bash
pip install -r requirements.txt
pytest -q
node --check static/app.js
```

The tests exercise ranking modes, diverse shortlist, deterministic vectorization,
safe fallback when Valhalla is disabled, contextual search, route endpoint, and
planning API. GitHub Actions availability depends on account runner settings.
A CI failure with no job steps or assigned runner is not evidence that these
tests ran. Verify the deploy status, `/api/health`, `/api/catalog`,
`/api/discover` and `/api/plan` after each release.

## 8. Known backlog

1. Add Alembic migrations rather than depending indefinitely on `create_all`.
2. Add a supplier verification workflow with authenticated documents.
3. Implement actual geocoded pickup/dropoff waypoints, verified accessibility,
   hard arrival-time constraints and buffer-sensitive vehicle scheduling.
4. Add optimization re-run after Google FreeBusy filters shortlist.
5. Add model evaluation (precision@k/relevance judgments) before marketing
   semantic matching as an advanced recommender.
6. Run automated Playwright mobile/desktop browser tests and a11y checks.
7. Separate routes and caching in external infra for multiple Render instances.
