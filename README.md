# AgentArena

AgentArena is a local research workbench for configuring two simulated agents, running a seeded number-target experiment, and inspecting its recorded decisions.

## Milestone 1

M1 is a single-user, local application. It uses a Next.js and TypeScript web interface, a Python FastAPI service, and PostgreSQL in Docker Compose. The simulation strategies are greedy, cautious, and seeded-random. Repeating the same configuration and seed produces the same result and trace; storage IDs and timestamps are not part of that reproducibility guarantee.

Agents are simulations, not LLMs or external services. M1 makes no paid API calls and does not include authentication, multi-user access, arbitrary code execution, distributed/background runs, or cloud deployment.

## Run the full application

You need Docker with the Compose plugin.

```sh
docker compose up --build
```

The web app uses host port `3000` by default. If another local service already uses that port, select a different host port:

```sh
WEB_PORT=3100 docker compose up -d --build
```

Open the app at <http://localhost:3000> by default, or <http://localhost:3100> with that override. The API stays at <http://localhost:8000>; its health endpoint is <http://localhost:8000/health> and its interactive API docs are at <http://localhost:8000/docs>. Compose also updates the API's allowed browser origins to match `WEB_PORT`.

Compose binds the web and API ports to this machine's loopback interface. PostgreSQL is available to the API inside the Compose network and is not published on a host port. The `postgres_data` volume keeps experiment data between restarts. Stop the services with `Ctrl-C` or `docker compose down`.

## Try an experiment

1. Create an experiment, for example with seed `42`, target `20`, round limit `10`, and two agents named Ada (greedy) and Grace (cautious).
2. Select **Create experiment** to save the configuration as a draft.
3. Select **Run experiment** to execute it and persist the result and ordered trace.
4. Review the final value, target status, rounds, actions, and agent contributions. Use **Next**, **Previous**, and **Reset** in Trace replay to inspect each decision.
5. Refresh the page and select the experiment in the history to load the saved result again.

The random strategy uses the experiment seed. Re-running a completed experiment returns its saved result rather than adding duplicate trace events.

## Develop and test

For backend setup and test commands, frontend scripts, and browser-test prerequisites, see [CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Known limits

- Each experiment has exactly two simulated agents and runs synchronously for at most 100 rounds.
- PostgreSQL through Compose is the supported full-stack setup. The backend tests use an isolated SQLite database; SQLite is also available for standalone local API development.
- The 31-test pytest suite and the real-PostgreSQL smoke checks have passed. The smoke checks cover four concurrent requests for one run and persistence across an API restart.
- Three real-browser acceptance tests passed against the Compose app on host port `3100`. They cover create/run/results, replay, repeat-run idempotency, refresh persistence, duplicate-name validation, and a 390px layout. See [docs/QA.md](docs/QA.md) for the run details and what remains unverified.
- Authentication, multiple users, real model providers, live streaming, background workers, exports, and production deployment are outside M1.

## License

MIT. Copyright (c) 2026 AgentArena contributors.
