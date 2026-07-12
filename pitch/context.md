# Sentinel — Pitch Context

> **Purpose:** Working context for the **pitch portion** of the hackathon. This file accumulates the raw material — problem, scope, differentiation — that the pitch script will later draw from. It is intentionally pitch-focused, not an engineering spec.
>
> **Status:** Context-gathering. Script to be written later (see `pitch/script.md` when it exists).

---

## The One-Liner

**Sentinel** is an AI-powered airport operations monitoring platform that gives operations teams real-time visibility into passenger flow, queue congestion, and check-in counter utilization — and alerts them to problems *before* they escalate.

---

## Problem Statement

Airport operations teams need real-time visibility into passenger flow, queue congestion, check-in counter utilization, and operational bottlenecks.

Current monitoring relies heavily on **manual observation** and **fragmented operational systems**, limiting the ability to proactively manage passenger experience during peak periods.

## Current Challenges

- Limited visibility into real-time passenger movement.
- Delayed response to congestion events.
- Difficulty estimating queue wait times.
- Inconsistent monitoring across multiple operational zones.
- High dependency on manual observation.

## Pilot Scope

The pilot delivers five concrete capabilities:

1. Detect passenger queues and congestion.
2. Measure queue length and estimated waiting time.
3. Monitor check-in counter utilization.
4. Detect abnormal crowding events.
5. Provide real-time alerts to airport operations teams.

## Deployment Focus

Pilot deployment focuses on **selected check-in areas and operational zones within a single airport terminal** — a bounded, provable footprint rather than an airport-wide rollout.

## Enabling Technology (What Startups Can Provide)

- Computer Vision
- Video Analytics
- Edge AI
- Multi-Camera Tracking
- Real-Time Operations Dashboards
- Live public-web operational context via TinyFish, kept behind the same adapter boundary as other external feeds.

## Build Direction

Build an AI-powered operations monitoring platform that:

- detects passenger queues and congestion,
- estimates waiting time,
- monitors counter utilization,
- detects abnormal crowding, and
- alerts operations teams in real time.

---

## Know Your Audience — Judge & Company

> **Source note:** LinkedIn blocked direct profile access, so this is assembled from public web sources matching **"Phong Do" + Galaxy Holdings**. High-confidence match, but worth a sanity check against the actual LinkedIn profile before relying on any single detail.

### The Judge — Phong Do (Do Vuong Phong)

- **Role:** CEO of **Galaxy Technology Services (GTS)** — the IT / digitization / software arm of the Galaxy Holdings ecosystem.
- **Founder story:** Co-founded **BStar Solutions** in 2016 with Truong Minh Huynh (now GTS CTO). Bootstrapped from ~VND 36M funded on a credit card, out of a 60 m² office at Quang Trung Software Park. BStar joined Galaxy Holdings in late 2021 and became GTS, now operating across **12+ countries**.
- **Formative background:** Extensive experience in the **Japanese market** — associated with *precision, discipline, and exceptionally high standards*. Also worked at a U.S. tech company; came away believing a small team can create outsized value.
- **Go-to-market instincts:** Deliberately pursued **demanding clients** (established enterprises, multinationals) over easy wins. Targeted Singapore first, even offering free work initially to build credibility and a portfolio.
- **Stated values:** Quality and credibility **over** rapid growth; professionalism; keeping "the spirit of a child — curious, fearless, energetic, ambitious"; "Enjoy Business."

### The Company — Galaxy Holdings

- **What it is:** A **Digital Technology – Data – AI** corporation that drives transformation from traditional business to digital business. Part of the **Sovico Group** ecosystem (the family behind Vietjet Air and HDBank).
- **Portfolio companies:** Galaxy Pay (fintech / e-wallet), **Galaxy Technology / GTS** (the judge's company), **Galaxy Joy** (airline loyalty / points), Galaxy One (infrastructure & procurement), FinOS (digital finance), Galaxy Connect, Galaxy Telecom, Galaxy FinX.
- **Tech backbone:** AI, Big Data, Cloud Computing, and blockchain.

### 🎯 The Strategic Hook (Why This Matters for the Pitch)

- On **Feb 26, 2026**, Galaxy Holdings signed a **~USD 5 billion long-term strategic partnership with HDBank and Vietjet** covering the full technology value chain — explicitly including **digital aviation services**, customer-platform integration, and loyalty systems (Galaxy Joy).
- **Translation:** the judge's parent group is actively investing billions into **aviation digital transformation**. An AI-powered **airport operations** platform is not a novelty to them — it is squarely inside their declared strategic roadmap. Lean into this.

### How to Tailor the Pitch to This Judge

- **Fit the aviation ambition:** Frame Sentinel as a natural fit for a group already building digital aviation with Vietjet. Optionally name the ecosystem alignment (Vietjet operations, Galaxy Joy loyalty, real-time passenger data).
- **Lead with quality and credibility, not hype:** He values precision and proof over flash. Show a working pilot, real metrics, and a believable path — avoid vague "AI magic" claims.
- **Respect the "small team, big value" ethos:** A lean team shipping a real, high-standard product is exactly his own origin story. Emphasize execution quality.
- **Show enterprise/scale thinking:** He chased demanding enterprise clients deliberately. Address how this scales from one terminal → multiple zones → airport-wide, and how it holds up to real operational standards.
- **AI / Data / Cloud literacy is assumed:** He's a tech CEO. The technical story (computer vision, edge AI, multi-camera tracking, real-time data platform) can be confident and specific.

---

## Pitch Notes & Additional Context

_Space for context to be layered in as it comes. Add supporting points, framing, stats, demo talking points, and differentiation below._

### Point 2 Vendor Framing: Data Integration

Use **TinyFish** as the hackathon-facing data integration story.

- Core operational inputs remain cameras, flight schedules, and staff rosters.
- TinyFish adds live public-web operational context when official feeds are delayed, incomplete, or need corroboration.
- Best demo examples: airline flight-status pages, airport advisories, gate disruption notices, and browser-rendered public pages that normal feed polling may miss.
- Vendor data must enter through adapters and become normalized observations with freshness and confidence before it can affect forecasts or Otto AI.
- Do not position TinyFish as owning camera ingestion, roster integration, decision ranking, or operational execution.

Use **Bright Data** as the production-scale answer if judges ask how this expands beyond one terminal.

- Bright Data is the stronger framing for broad, resilient public-source acquisition across many airline, airport, weather, and disruption pages.
- The production story is that the same adapter boundary can swap TinyFish-style demo enrichment for Bright Data-style large-scale acquisition without changing decision support.

Recommended talk track:

> "Point two is data integration. We fuse internal airport signals with fresh public operational context. In the hackathon demo, TinyFish helps read browser-rendered airline or airport pages when official feeds lag. In production, the same adapter pattern can scale through Bright Data."
