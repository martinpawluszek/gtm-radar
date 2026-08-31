---
# GTM Radar

**An AI-powered system for scoring B2B opportunities, tracking pipeline, and managing strategic outreach — built by directing AI tools, not hand-writing code.**

🔗 **Live app:** [gtm-radar.lovable.app](https://gtm-radar.lovable.app) *(auth-gated — [message me](https://www.linkedin.com/in/martin-pawluszek/) for a walkthrough or demo access)*

---

## The idea

Every part of this system — scoring opportunities against a weighted model, tracking a multi-stage pipeline, running AI-assisted outreach with a feedback loop — maps 1:1 to what a RevOps/GTM leader builds for a sales org. I built it as a real production tool for my own job search, structured exactly like a GTM system, because I wanted a working example of AI-native product judgment rather than a slide deck about it.

Two independent systems share one database and never call each other directly:

```
┌─────────────────────────────┐       ┌──────────────────────────────┐
│   FRONTEND (Lovable)         │       │   AGENTS (n8n)                │
│   Opportunity scoring UI     │       │   Scraper + scoring agent     │
│   Pipeline tracking          │       │   Runs 3x/week                │
│   Outreach tracker           │       │   Feedback-informed re-scoring│
│   Dashboard                  │       │                                │
└─────────────┬─────────────────┘      └──────────────┬─────────────────┘
              │                                        │
              │           reads / writes               │
              └───────────────────┬────────────────────┘
                                   │
                        ┌──────────▼──────────┐
                        │  Supabase (Postgres) │
                        │  RLS on every table  │
                        └──────────────────────┘
```

The database is the contract. Either system can be rebuilt or replaced without touching the other — the UI works even if the agent is down, and the agent works even if the UI changes.

## What it does

- Scores opportunities against a **weighted, editable model** (5 parameters, custom weights) instead of a static keyword filter — and the model itself learns: every accept/reject decision writes feedback back to the database, which shifts scoring weights for the next run.
- Runs an autonomous scraping + scoring agent on a schedule, independent of the frontend.
- Tracks a full pipeline (sourced → applied → interviewing → outcome) with stage-advancement analytics.
- Runs a parallel outreach tracker with A/B segmentation and conversion metrics.
- Generates tailored, structured documents from unstructured input via an LLM, with a validation gate before output.

## Stack, and why

| Layer | Tool | Why |
|---|---|---|
| Frontend | Lovable | Fast iteration on React + Tailwind without hand-writing every component; kept me focused on product decisions, not boilerplate |
| Database / Auth | Supabase | Real Postgres, row-level security, REST + Realtime APIs consumed by both the frontend and the automation layer |
| Automation / agents | n8n | Self-hosted orchestration for scraping + scoring runs, independent of the app's uptime |
| AI reasoning | Claude API (Anthropic) | Structured JSON-mode scoring output, prompt-level feedback injection |

## How this was built

I directed this build end-to-end using Claude Code and Lovable's AI agent rather than writing the implementation by hand — the same way I'd direct an engineering team: specifying the data model, the scoring logic, the architecture boundary between the app and the automation layer, and reviewing every change. The product decisions, the schema design, and the scoring methodology are mine; the AI tools handled implementation. I think that division of labor is exactly what AI-native GTM and product roles increasingly look like, and this project is the proof, not just the pitch.

## Security notes

- Row-level security enabled on every table.
- The frontend bundle only ever carries a public, RLS-scoped anon key — no privileged credentials ship to the client.
- Secrets used by the automation layer live outside this repo.

---

*Built by [Martin Pawluszek](https://www.linkedin.com/in/martin-pawluszek/) — CRO exploring the technical side of enterprise AI sales.*
