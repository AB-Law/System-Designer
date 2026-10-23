# Design Canvas

Practice system design by building on a canvas.

You drag blocks (servers, databases, caches, queues, and more), connect them, and run **scenarios**. A scenario is a test case: more traffic, or a failure like a database going down. The app tells you what passed, what failed, and why. You can also ask an optional AI for a review or coaching tips.

## Quick start

The simplest way to try it is frontend only. Problems are bundled in the app. Your designs and submissions stay in this browser.

```bash
cd app
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

### Optional: backend

Use the FastAPI backend if you want sign-in, shared designs on a server, or AI calls without browser CORS issues. The API key can live in `backend/.env`.

```bash
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
backend/.venv/Scripts/python -m uvicorn main:app --app-dir backend --port 8000
```

Keep `npm run dev` running too. Vite forwards `/api` to port 8000. The top bar shows **backend** instead of **standalone**.

Backend layout: [`backend/main.py`](backend/main.py), routers in [`backend/routes/`](backend/routes/), SQLite in [`backend/db.py`](backend/db.py), problem validation in [`backend/schema/`](backend/schema/), auth in [`backend/auth/`](backend/auth/). Tests: `cd backend && pytest`.

For one process only: `npm run build` in `app/`, then open http://localhost:8000.

### Docker

```bash
docker build -t design-canvas .
docker run --rm -p 8000:8000 -v design-canvas-data:/data design-canvas
```

By default the image uses local SQLite (`LITESTREAM_ENABLED=0`). For Azure Container Apps, see [Deploy notes](#deploy-notes) below.

## How to use it

1. **Pick a problem** from the home screen or the top bar. Each problem has a brief, traffic numbers, and scenarios to pass.
2. **Build on the canvas.** Drag blocks from the left panel. Click a block to edit settings. Connect blocks with edges (sync, async, or bidirectional).
3. **Run Simulate.** The app pushes load through your design and applies each scenario (traffic spike or failure). Results explain passes and fails in plain language.
4. **Read the score.** Overall score mixes scenarios (50%), requirements met (25%), and confidence (25%). Going over the monthly budget caps the score at 60.
5. **Optional AI.** Open **AI** in the top bar for a review, or **Ask the coach** for hints. The coach never changes your canvas unless you press Apply.
6. **Learning roadmap.** The Roadmap button walks all 17 problems in a suggested order with short primers and a glossary. You can open any step out of order. A step counts as done when every scenario passed and score is at least 80.

Useful extras while you work:

- **Worked alternative:** under a scenario result, show a reference design that passes.
- **Versions:** snapshots when you run, submit, or save by name. Compare two versions to see what changed.
- **Tidy:** toolbar button that lays out the graph along connections (undoable).

## Problems (17)

| Difficulty | Problems |
|---|---|
| Easy | `pastebin`, `url_shortener`, `notification`, `library_management` |
| Medium | `messaging_app`, `news_feed`, `google_drive`, `metrics_monitoring`, `ticket_booking` |
| Hard | `ad_serving`, `payment`, `ride_sharing`, `food_delivery`, `maps`, `web_crawler`, `search`, `video_streaming` |

Sample designs (pass and fail) live in `app/scripts/try-*.ts`. To print a summary:

```bash
cd app && npx tsx scripts/summary.ts
```

## Optional features

### AI review and coach

Open **AI** in the top bar.

- **LM Studio:** load a model and start the local server (default `http://localhost:1234/v1`). With the backend, no CORS setup is needed. From the browser alone, enable CORS in LM Studio. For reasoning models, leave **Thinking** Off so reviews stay fast (about 10s instead of ~90s).
- **OpenAI:** paste a key in the browser, or set `OPENAI_API_KEY` in `backend/.env`.

The review sees your design, simulation results, automatic findings, and the problem rubric. It returns a score, strengths, gaps, and suggestions. It can also add three "what if" follow-up tests the simulator runs for real (not just opinions). Those are not part of the score.

**Ask the coach** is a chat that hints instead of handing you the answer. Suggested canvas edits appear on a card; nothing applies until you confirm (one undo step).

### Accounts, sharing, cohorts

Without a server you are a **guest**. Everything stays in this browser.

With the backend you can sign in. Designs, versions, and submissions sync to the server.

- Sign-up is invite only. On first start the backend writes a code to `backend/invite_code.txt` (or set `INVITE_CODE` in `backend/.env`).
- **Sharing:** revocable link (needs sign-in), embed link (no server, cannot revoke), or a file download/import. Incoming designs are sanitized before they touch the canvas.
- **Cohorts:** group codes on the home page. Members see names and best scores, not designs.

### Cost and fair play

Huge typed-in numbers do not win.

- Every capacity field has a realistic maximum. The simulator clamps values.
- Every block has a monthly price. Each problem has a budget.
- Settings that would be "free wins" (like processing time) are fixed, not editable.

## For people adding content

### Add a problem

1. Copy `app/src/problems/ad_serving.json` as a template.
2. Save as `app/src/problems/<id>.json` where the file name equals the `id` field.
3. Write original text. `python tools/copycheck.py <reference.json>` flags shared 6-word runs against a reference file.
4. The backend lists validation errors at `/api/health`. Standalone picks up new files on the next build.

Main fields in short:

- `traffic`: peak load (`users` × `reqPerUser`) and `writeShare` (fraction of writes).
- `scenarios`: traffic multiplier, optional failure (`down` or `slow`).
- `requirements`: checks the design must meet (`scenario`, `has`, `budget`, `ai`, and others). See [`schemas/problem.schema.json`](schemas/problem.schema.json).
- `capabilities`: what the system must do (serve a paste, show an ad, and so on). Players assign each to a block under **What this block runs**.
- `rubric`: what the AI reviewer should look for.
- Optional: `dataModel` (tables and queries for the Database settings), `regions` (multi-continent users and outages).

**Capabilities in plain terms:** one block can run everything (monolith) or you can split jobs across services. Splitting isolates failures but adds hop latency and cost. Background jobs (like expiry) use capacity on their host and write load on the database.

To edit the learning path: [`app/src/roadmap/roadmap.ts`](app/src/roadmap/roadmap.ts) and [`app/src/roadmap/glossary.ts`](app/src/roadmap/glossary.ts). Each `problemId` must match a problem file; every problem should appear once.

### Add or change a block

Blocks are data in [`app/src/blocks/index.ts`](app/src/blocks/index.ts): typed fields plus a `model(cfg)` for capacity and latency. The settings panel is generated from the fields. Only add options the simulator actually uses.

A few blocks to know:

- **Stream:** ordered, replayable log. Use when order or replay matters.
- **Queue:** competing consumers, no order, no replay.
- **Database:** engine (relational, key-value, document, time-series) and locking are separate settings.
- **Geo Index:** "near me" queries; structure choice trades update speed vs query quality.
- **Third-party API:** kinds like ad network, payment, messaging, maps.

## How the simulation works

[`app/src/sim/engine.ts`](app/src/sim/engine.ts) pushes load from User blocks through connections. It applies capacity, cache hits, instances, and the scenario failure. It reports served ratio and latency (latency rises as a block nears capacity).

[`app/src/sim/analyze.ts`](app/src/sim/analyze.ts) turns that into findings, confidence scores, requirement checks, and the overall score.

## Deploy notes

**Local Docker** (SQLite on a volume) is enough for trying the full stack. See [Quick start](#docker).

**Azure Container Apps** use ephemeral disks. Turn on Litestream so the DB restores from and replicates to Blob Storage:

1. Create a storage account and container.
2. Set `LITESTREAM_ENABLED=1`, `LITESTREAM_AZURE_ACCOUNT_NAME`, `LITESTREAM_AZURE_CONTAINER`, and either `LITESTREAM_AZURE_ACCOUNT_KEY` or a managed identity with **Storage Blob Data Contributor**.
3. Keep **one replica**. Litestream is single-writer. Scaling out will corrupt the replica.

Optional env: `LITESTREAM_AZURE_PATH` (default `data.sqlite3`), `DB_PATH` (default `/data/data.sqlite3`).
