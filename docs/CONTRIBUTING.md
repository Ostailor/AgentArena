# Contributing

AgentArena M1 is a local, single-user simulation workbench. Keep changes within that scope: the agents are deterministic Python simulations, and features must not imply real model calls, external-agent execution, or cloud services.

## Full-stack development

Docker Compose starts PostgreSQL, the API, and the web app together:

```sh
docker compose up --build
```

The web app is at <http://localhost:3000>; the API is at <http://localhost:8000>. Compose supplies the API's PostgreSQL connection over its private network. It does not publish the database port to the host.

Port `3000` is the default for the web app. If it is occupied, set `WEB_PORT` to another host port; the API's CORS configuration follows it:

```sh
WEB_PORT=3100 docker compose up -d --build
```

Then use <http://localhost:3100>. The API remains at <http://localhost:8000>.

## Backend

Use Python 3.12 or later. From the repository root:

```sh
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-test.txt
.venv/bin/python -m pytest -q
```

The test suite configures an isolated SQLite database before importing the app. To run the API locally with SQLite, install the same requirements and start it with:

```sh
DATABASE_URL=sqlite:///./agentarena.db .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The default backend connection uses PostgreSQL at `localhost:5432`, but Compose does not publish that port. For PostgreSQL-backed development, use the Compose services or provide a separately reachable PostgreSQL instance and set `DATABASE_URL` accordingly.

## Frontend

Use Node.js 20 or later. From the repository root:

```sh
cd frontend
npm ci
npm run dev
```

The frontend calls `http://localhost:8000` by default. Set `NEXT_PUBLIC_API_URL` when the API uses another address; it is embedded at build time for production builds.

Available scripts:

- `npm run dev` starts the Next.js development server.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run build` creates the production build.
- `npm run test:e2e` runs the Playwright browser test.

## Tests

Backend tests:

```sh
cd backend
.venv/bin/python -m pytest -q
```

The Playwright suite uses the real application and API. Start the full Compose stack in one terminal, then in another:

```sh
cd frontend
npx playwright install chromium
npm run test:e2e
```

`PLAYWRIGHT_BASE_URL` can override the browser's default base URL (`http://localhost:3000`). If Compose uses `WEB_PORT=3100`, run `PLAYWRIGHT_BASE_URL=http://localhost:3100 npm run test:e2e`. The browser tests create experiments in the configured API database, so their data remains there after the run.

The current suite has three passing real-browser tests covering creation, execution, rendered results, replay controls, repeat-run idempotency, refresh persistence, duplicate-name validation, and a 390px layout. See [QA.md](QA.md) for the exact tested environment and limitations. Full results do not establish persistence across an API restart or compatibility with every browser/device.

To exercise the running API and PostgreSQL directly, start Compose and run this from the repository root:

```sh
python3 scripts/smoke.py
```

The smoke check creates persistent experiments and checks health, seeded determinism, trace invariants, validation, and four concurrent requests for one run. It prints a persisted experiment ID. After restarting the API, verify that saved run with:

```sh
python3 scripts/smoke.py --verify-id <experiment-id>
```

If Compose uses a non-default web port, point Playwright to it, for example `PLAYWRIGHT_BASE_URL=http://localhost:3100 npm run test:e2e`.

## Implementation notes

- Keep the simulation engine deterministic for a given configuration and seed. Keep database IDs and wall-clock timestamps outside its reproducibility payload.
- Preserve the API contract in `docs/ARCHITECTURE.md`; coordinate contract changes between backend and frontend work.
- Validation errors and service failures should be visible. Do not present a failed or partial run as successful.
- M1 execution is synchronous and bounded. Authentication, multi-tenancy, background processing, streaming, and production operations belong to later work with explicit scope.

The root `LICENSE` uses the project notice `Copyright (c) 2026 AgentArena contributors`.
