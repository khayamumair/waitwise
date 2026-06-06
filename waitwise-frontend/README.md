# WaitWise — Frontend

A polished, real-time dashboard for coordinating NHS-style patient waiting lists.
WaitWise streams an agent pipeline as it scans the waiting list, flags high-risk
cases, triages them, and drafts communications for a coordinator to approve.

Built with **Vite + React + TypeScript**. Lightweight, no UI framework lock-in —
just Tailwind CSS and a handful of focused components.

## Quick start

```bash
pnpm install
cp .env.example .env        # then edit VITE_API_BASE_URL
pnpm dev                    # http://localhost:5173
```

Production build:

```bash
pnpm build
pnpm preview
```

## Configuring the backend URL

The app talks to a FastAPI backend whose base URL is read from the
`VITE_API_BASE_URL` environment variable at build/dev time.

Create a `.env` file in the project root (copy from `.env.example`):

```bash
# No trailing slash
VITE_API_BASE_URL=http://localhost:8000
```

- In development, if the variable is unset it falls back to `http://localhost:8000`.
- Vite only exposes variables prefixed with `VITE_` to the client.
- Restart the dev server after changing `.env`.
- For production hosting (e.g. Vercel), set `VITE_API_BASE_URL` as a build-time
  environment variable.

The backend must allow CORS for the frontend origin (the provided backend does).

## Valid coordinator IDs

`CO001`, `CO002`, `CO003`, `CO004`, `CO005`. These populate the coordinator
selector in the control panel.

## Backend contract

| Method | Path                    | Purpose                                   |
| ------ | ----------------------- | ----------------------------------------- |
| POST   | `/scan`                 | Start a scan: `{ coordinator_id }`        |
| GET    | `/stream/{scan_run_id}` | SSE stream of pipeline events             |
| GET    | `/results/{scan_run_id}`| Flagged cases once the scan completes     |
| POST   | `/approve/{triage_id}`  | Approve a triage: `{ coordinator_id }`    |
| GET    | `/gpu`                  | GPU utilisation snapshot (polled every 2s)|

The SSE stream emits JSON events with the fields `event_id`, `scan_run_id`,
`timestamp`, `agent`, `event_type`, `patient_id`, and `message`. When an event
with `event_type: "pipeline_complete"` arrives, the stream is closed and results
are fetched. Flagged cases are sorted by risk level, then risk score, descending.

## Project structure

```
src/
  App.tsx                 # Page composition
  main.tsx                # Entry point
  index.css               # Theme tokens + Tailwind layers
  lib/
    types.ts              # TypeScript types for every API response
    api.ts                # API client (fetch + SSE URL helper)
    utils.ts              # cn(), time + risk helpers
    mockData.ts           # Dev-only sample data for the demo fallback
  hooks/
    useScan.ts            # Scan/stream/results/approve state machine
    useGpuStatus.ts       # Polls /gpu every 2s
  components/
    AppShell.tsx          # Header + GPU badge + layout
    ControlPanel.tsx      # Coordinator select, Start scan, status
    LiveTrace.tsx         # Streamed event log
    ResultsList.tsx       # Sorted flagged cases
    CaseCard.tsx          # Single case: patient, triage, comms, approve
    GpuBadge.tsx          # GPU utilisation indicator
    RiskBadge.tsx         # Risk level pill
```

## Demo mode (no backend)

In development a dashed **Run demo** button appears in the control panel. It
replays mocked events and results from `src/lib/mockData.ts` so you can exercise
the full UI — streaming trace, flagged cases, and approvals — without a running
backend. The real API path remains the default; demo mode is purely a dev aid
and is hidden in production builds.

## Extending

- Add new event types: handle them in `LiveTrace.tsx` (`eventAccent` / `AGENT_COLORS`).
- New case fields: extend the types in `lib/types.ts` and render them in `CaseCard.tsx`.
- Theme: edit the CSS custom properties in `src/index.css` and the token map in
  `tailwind.config.js`.
