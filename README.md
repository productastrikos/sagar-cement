# S!aP ClinkerIQ — lab-to-plant intelligence for Sagar Cements

A proof of concept built strictly on the 6 November 2026 Astrikos × Sagar Cements discovery meeting
(`docs/Astrikos_Sagar_Cements_Meeting_Summary.docx`) and the two research briefs in `docs/`.
It replaces the earlier CemPulse demo (still on the `no-db` branch). Live at https://sagar-cement.astrikos.xyz:8443.

The name: "CemSync" was rejected in research (Envirosoft already ships a CEMS module called CEMSync); ClinkerIQ came back clean.

## What the meeting asked for → where it is

| Meeting point | Screen |
|---|---|
| Stabilise data receipt and handling (immediate focus) | **Connectivity & data health** — edge store-and-forward, dead-letter queue, live "broken-pipe" test |
| Connect XRF, XRD, particle size, cross-belt, calorimeter, microscope, strength testers | **Lab integration** |
| Connect field instruments, sensors and cameras | **Field & vision** |
| Bring raw material, process, operational and field data together | **Material genealogy** |
| Correlate clinker parameters with cement quality | **Quality workbench** (residence-time aligned vs naive join) |
| Predict process behaviour, optimise against product specs | **Predict & optimise** (soft sensor, 28-day forecaster, BIS IS 269/1489/455, what-if) |
| Energy management, power automation, renewables | **Energy scorecard · Power automation · ToD & dispatch · Process efficiency** |
| Corporate demo (architecture, connectivity, analytics) | **Fleet overview · AI advisory · Platform & architecture** |

Data: Sagar's real six plants (capacities, kilns, CPP/WHRS/solar/hydro), FY 2026–27 TGERC/APERC/MPERC/OERC ToD tariffs,
BIS limits and the research's seven anomaly scenarios. Contract demand per plant and the Dachepalli kiln split are demo assumptions (flagged in `server/domain/plants.js`).
Everything is simulated — no plant connection.

## Stack (deliberately simple)

| Layer | Tech |
|---|---|
| Client | React 18 (CRA), React Router 6, Recharts, Leaflet, lucide-react, self-hosted Lexend Deca + Lato, jsPDF / html2canvas / SheetJS for the Document Studio |
| Server | Node.js + Express, JWT, in-memory simulation ticking every 5 s — **no database** |
| Theme | `client/src/styles/theme.css` generated verbatim from *Astrikos UI Theme v2.0*; product patterns in `additions.css` |

## Run locally

```bash
npm run install:all
npm run dev            # API :4000 + client :3000
npm run selftest       # 767 checks: card == drawer hero, forecast contract, determinism, scenario evidence, MD rules
```

Open http://localhost:3000. Demo accounts (password `Astrikos2026`): `admin`, `quality`, `process`, `energy`.

## S!a Copilot

`@astrikos/sia-copilot` is vendored as `client/vendor/astrikos-sia-copilot-1.0.0-ciq.1.tgz` (two small patches: async custom handlers, and rule-brain misses routed to an `llm` handler). Content lives in `client/src/copilot/` (tours = the guided demo, knowledge = pages, KPIs, glossary). Questions the rules cannot answer go to `POST /api/sia/ask`, which answers from a live ClinkerIQ snapshot using the key in `server/.env`. Open it with **Ctrl+Shift+A**, the sidebar button, or profile menu → **Guided demo by S!a**. Voice input needs Chrome or Edge.

## Presenting

- Profile menu → **Demo director** (or `?director=1`) fires scenarios S1–S7, the WAN outage, a malformed XRF row and the peak-hour MD ramp.
- Two live moments: **Connectivity → "Cut the WAN for 60 s"** and **Power automation → "Ramp the mills inside the peak window"**.
- Every KPI card opens its detail drawer (trend, forecast with 95% band, breakdown, AI advisory with Apply); every Download goes through the Document Studio (PDF / Excel / CSV / PNG).
- The boot state already carries two stories: XRF drift at Mattampally Kiln 2 and a wet, low-glass slag rake at Jajpur.

## Layout

```
server/
  domain/   plants, tariffs, BIS specs, instrument & connector catalogue
  sim/      scenarios, process, lab, connectivity, power, advisory, engine, selftest
  kpi/      registry (63 KPIs), history, forecast (§8.17), insight (drawer payload §8.16)
  routes/   core, data, quality, energy, platform
client/src/
  lib/        theme, tokens, api, auth, live polling, kpi drawer, studio, toast
  components/ Shell, KpiDrawer, DocStudio, Advisory, charts, ui, Search, Director
  pages/      13 pages + Login
```

Deployment: see `DEPLOY.md`.
