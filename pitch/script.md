# Sentinel — Pitch Script

> **Runtime target:** ~4:00 (5:00 hard max). **Word budget:** ~550 spoken words.
> **Tone:** Confident, precise, credibility over hype. The judge (GTS CEO) values quality and proof — show a working system, not "AI magic."
> **Before recording:** replace every `[bracket]` with a name. Let visuals breathe on the reveal moments — don't rush them.

Running tally in the right margin. Spoken lines are in `> quotes` — read them verbatim or make them yours.

---

## 1 · Opener — *~15s*

> "Hi, I'm [name]. This is my team. We built Sentinel — a real-time 3D dashboard for airport operations. The entire terminal in one live view."

**Show:** The 3D airport dashboard, live.

---

## 2 · Problem — *~25s*

> "Airport operations teams need real-time visibility into passenger flow and congestion. Today, that mostly runs on manual human observation — watching, radios, guesswork. So problems get spotted late, and every decision is reactive."

**Show:** Stay on the 3D dashboard.

---

## 3 · Solution

### 3a · The Dashboard — *~40s*

> "Our dashboard shows the terminal live, in 3D. Flights, arriving and departing."

**Show:** Animation — a flight arriving, then departing.

> "Passengers — every dot is a traveler, disembarking and moving toward immigration."

**Show:** Blue dots leaving the plane, flowing toward immigration.

> "And staff — color-coded by role: ground crew, immigration officers, security, airline staff."

**Show:** Staff dots reveal one role at a time, each color animating in with its label.

### 3b · Real-Time Decisions — *~45s*

> "With this, you make operational decisions in real time. For example, at 4:30pm — Vietjet VJ882 is landing. We look into the future: the dashboard forecasts how many passengers arrive, and where they'll move. Now watch — three airline staff sit idle at Gate 10, where a flight just left. But Gate 5, where VJ882 is arriving, is empty. One move: shift them to Gate 5. Staffing capacity meets demand"

**Show:** Time slider scrubs forward. Plane lands, passengers disembark. Highlight 3 idle staff at Gate 10 and the empty Gate 5. Pointer drags the staff from Gate 10 → Gate 5.

### 3c · AI-Powered Decisions — Otto AI — *~45s*

> "But humans aren't perfect — no one can watch every zone at once. So the dashboard ships with an AI agent. We call it Otto AI."

**Show:** Cute Otto AI avatar animates in at the side of the dashboard.

> "Otto AI reads the same real-time data, detects when a zone is about to be understaffed, and recommends the fix. Same example — but now Otto AI catches it at 4:00pm, half an hour early. It reads the flight schedule, the roster, and camera flow before the terminal gets crowded, and pings: 'Gate 5 understaffed for VJ882 — move 3 staff from Gate 10.' Click 'View details,' and it jumps the dashboard to 4:30pm, so you see exactly why."

**Show:** At 4:00pm Otto AI fires an alert: *"Move 3 staff, Gate 10 → Gate 5 for VJ882."* A **View details** button opens the 4:30pm dashboard state.

---

## 4 · Under the Hood — *~45s*

> "Three layers power this."

**Show:** Layered diagram builds in one layer at a time — Sensing → Data → AI.

> "One — sensing. Multi-camera tracking holds a single identity for each person as they cross dozens of camera views, with GPS tags pinning every staff member in real time."

> "Two — data. Camera flow, flight schedules, and rosters fuse into one live operational snapshot — and every value carries its freshness and confidence, so the system knows how much to trust each input."

> "Three — the AI. A model ensemble forecasts passenger flow — a transformer and a graph neural network lead, an LSTM tracks the sequences, and it falls back to a statistical baseline when confidence drops. Always a prediction, always labelled with its confidence — that's what Otto AI acts on."

---

## 5 · Closing — *~30s*

> "To wrap up — Sentinel delivers three things. One: total live visibility — the whole terminal in a single view. Two: foresight — spot bottlenecks before they form, and act early. Three: AI on watch — Otto AI catches what humans miss."

**Show:** Return to the full 3D dashboard.

> "This fits where aviation is already heading — the digital-aviation push Galaxy is making with Vietjet and HDBank needs a real-time operations layer. We believe this is it."

> "And this is the team behind it. [name], Computer Scientist. [name], Data Analyst. And I'm [name], Business and AI Systems."

**Show:** Team slide — names, one-line roles, background logos.

> "Hope you enjoyed it. We'd love to take your questions."

**Show:** The dashboard, live.

---

### Timing tally

| Beat | Time |
| --- | --- |
| Opener | 0:15 |
| Problem | 0:25 |
| Dashboard | 0:40 |
| Real-time decisions | 0:45 |
| Otto AI | 0:45 |
| Under the hood | 0:45 |
| Closing | 0:40 |
| **Total** | **~4:15** |

Buffer of ~45s for transitions, applause, and breathing room — comfortably under 5:00.

---

### Open questions / to finalize

- **Names & roles** for opener and team slide.
- **3 closing benefits** — current picks: live visibility / foresight / AI on watch. Swap if you have stronger ones.
- **Vietjet/Galaxy lean** — set to **medium**: VJ882 in the body + one strategic-fit line in the closing. 
- **Otto's alert copy** — exact wording of the on-screen ping.

---

## Appendix — Q&A & Track Requirements

*Not spoken in the 4-minute pitch. Talking points for judges' questions and the sponsor-track boxes.*

### Trust & governance — Terminal 3 *(if asked "can operators trust the AI?")*
- Otto AI runs on **Terminal 3 (T3N)**: it has a cryptographic identity (a DID), only touches the zones and data an operator grants (deny-by-default), and its decision logic runs in a confidential enclave.
- Every recommendation is **signed** and written to a **tamper-proof audit trail** — who, what, when, where, why, outcome.
- Otto AI **never acts on its own** — every proposal needs operator approval. That's the honest answer to "is this safe?", and it reinforces our human-in-the-loop design.

### Live public-web context — TinyFish *(data-integration track)*
- Core inputs stay cameras + flight schedules + rosters. **TinyFish** adds live public-web context (airline status pages, airport advisories, gate notices) when official feeds lag or need corroboration.
- It enters through the **same adapter boundary** as every other feed — normalized into observations with freshness and confidence before it can touch a forecast or Otto AI. It doesn't own ingestion, ranking, or execution.

### The model ensemble *(if pressed on the ML)*
- Ensemble architecture: transformer / GNN / LSTM / statistical baseline, confidence-weighted with graceful fallback.
- **Framing honesty:** the demo runs on the reliable baseline; the ensemble is the architecture it upgrades into. "Always falls back to a prediction we can stand behind" is the credible line — no overclaiming.

### Scale *(if asked "how does this go airport-wide?")*
- Bounded contexts + versioned contracts + adapters mean the system grows terminal → whole airport by adding zones and feeds, without rewriting decision support.
