## Inspiration

Airport operations teams still rely on fragmented systems, manual observation, and delayed updates when terminal pressure builds. We wanted to create a live decision-support surface where operators can see passenger flow, queue pressure, counter utilization, staff coverage, and flight impact before congestion becomes a passenger-experience problem.

## What it does

Untitled, currently built as AirportOps, is a real-time airport operations dashboard for selected terminal zones. It combines operational snapshots, queue analytics, passenger-flow forecasting, simulation, and Otto AI recommendations into one Stratus digital-twin surface.

Operators can inspect zones, compare live and simulated states, see upcoming flight pressure, and review ranked recommendations with confidence, evidence, and affected zones. The system is advisory only: it proposes staffing, counter, or routing decisions, but operators stay in control.

## How we built it

We built AirportOps as a dependency-light static ES module application backed by seeded operational data, deterministic domain modules, and a browser-first operations surface. The app can run from exported Postgres rows when they are available, or from fixture-shaped rows when they are not, which keeps the full demo path working without depending on live airport systems.

At the bottom of the stack is the operational database layer. It owns the Postgres schema, migrations, seed data, and export tooling that produce contract-shaped operational rows. Those rows describe the airport layout, zones, counters, staff, flights, passenger flows, observations, freshness, and confidence. The browser never queries SQL directly; it reads a normalized rows bundle and turns it into an immutable `OperationalSnapshot`.

Above that, the product is split into bounded contexts. Operational state validates and assembles snapshots. Monitoring derives queue length, estimated wait time, counter utilization, crowding events, bottlenecks, public context, and alerts. Prediction produces near-term passenger-flow and queue-pressure forecasts. Simulation projects what would happen if an operator changed counters, moved staff, or adjusted flow. Decision support ranks options from the snapshot, forecast, projections, and alerts, then attaches rationale, impact, confidence, and affected zones.

Agentic AI is used through Otto AI and the Beagle operations copilot. Instead of asking a model to guess from an unstructured prompt, the system gives the agent a bounded operating context: current snapshot, monitoring alerts, forecast points, simulation projections, staffing constraints, public-web observations, and allowed decision types. The agent swarm is modeled as specialist reasoning around queue pressure, counter capacity, staff movement, and forecast risk. These agents turn structured signals into explainable recommendations, questions, and proposal drafts, while deterministic rules remain available as the fallback when an AI service is unavailable.

The front end is the Stratus digital-twin surface: a static HTML/CSS/JavaScript app shell that composes those modules into one operator view. It renders the airport map, live and simulated modes, a forecast timeline, zone details, data-source status, public context, recent events, and Otto AI recommendations. The UI owns presentation state only; the operational calculations stay in the domain modules.

Terminal3 is the trust and governance layer for Otto AI. Otto has a Terminal3/T3N adapter for DID-backed identity, tenant-scoped KV storage, contract execution, operator delegation, permission checks, and audit logging. Every Otto recommendation is wrapped with provenance: the agent DID, timestamp, environment, audit reference, confidence, and approval requirement. The integration also includes a Rust-to-WASM TEE contract scaffold for confidential functions like `evaluate-options`, `verify-proposal`, `sign-recommendation`, and `record-audit`. For local demo and CI, fixture mode mirrors the T3N flow deterministically without network access.

TinyFish is the live public-web enrichment layer. The demo server keeps `TINYFISH_API_KEY` server-side, exposes `/api/tinyfish/public-context`, calls the TinyFish Search API, and normalizes search results into public operational updates. Those updates become `tinyfish-public-web` observations with zone, flight, severity, freshness, confidence, evidence, and source URL. The Stratus UI has a `Fetch live updates` action that applies TinyFish results to the current snapshot and renders them as public context and advisory alerts.

We protected the stack with deterministic tests using Node's built-in test runner. The tests cover operational database exports, TinyFish normalization, Terminal3 fixture identity and KV behavior, Otto permissions and audit trails, monitoring analytics, prediction, simulation, and the full airport-operations decision path.

## Challenges we ran into

The hardest part was avoiding "AI magic." Airport operations recommendations need traceability, so every signal had to carry freshness, confidence, and evidence.

Terminal3 pushed us to separate Otto's authority from Otto's intelligence: Otto can read operational data and create recommendations, but operational changes require permission checks and operator approval. TinyFish created a different boundary challenge: public-web results are useful, but they cannot be treated as raw truth. We solved that by routing them through an adapter that validates snapshot, zone, and flight references before they influence monitoring.

## Accomplishments that we're proud of

We built a working end-to-end decision path: operational rows become snapshots, snapshots become monitoring analytics and forecasts, forecasts feed simulations, and Otto produces explainable options.

We are especially proud of the Terminal3-backed Otto design. It gives the AI agent identity, permissions, delegation, auditability, and a path to confidential TEE execution instead of making it an ungoverned chatbot.

We are also proud of the TinyFish integration because it demonstrates a realistic data-integration story: when official feeds lag, browser-rendered public airline or airport pages can add fresh context without leaking vendor details into the domain model.

## What we learned

We learned that operational AI is mostly a trust problem. The recommendation itself is only useful if an operator can see where it came from, how fresh the data is, what confidence it has, and whether the agent was allowed to produce it.

We also learned that external web context is powerful when it is normalized carefully. TinyFish is valuable because it gives the system live public signals, but the adapter boundary is what makes those signals safe for operational use.

## What's next for Untitled

Next, we would connect real airport feeds: camera analytics, flight schedules, staff rosters, and airport layout systems. We would move the current monorepo bounded contexts into independent repositories with versioned contracts, complete the production Terminal3 KV and contract registration path, and expand TinyFish-style public context into broader disruption monitoring across airline, airport, weather, and advisory sources.

We would also improve the Otto workflow from recommendation to operator-reviewed proposal, so teams can approve, reject, and audit decisions through the same governed flow.

## Built with

JavaScript ES modules, Node.js, Postgres schema and seed tooling, static HTML/CSS app shell, Terminal3 / T3N, Rust/WASM TEE contract scaffold, TinyFish Search API, deterministic fixtures, and Node's built-in test runner.

## Optional Links

- Terminal3 docs: https://docs.terminal3.io/t3n/how-t3n-works/z-namespace
- TinyFish Search API docs: https://docs.tinyfish.ai/search-api
- TinyFish product site: https://www.tinyfish.ai/
