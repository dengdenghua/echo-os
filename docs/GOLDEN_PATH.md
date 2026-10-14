# Golden Path

The shortest path from a fresh checkout to the product loop: **first boot →
login → first task → approval → result**. It runs the browser desktop with the
embedded Agent from source; installers and the NAS appliance are at the end.

## 0. Prerequisites

- Git, [uv](https://docs.astral.sh/uv/) `0.11.25` (pinned by `pyproject.toml`).
  uv provisions Python 3.11+ itself; you never call `pip` or a bare `python`.
- Node.js 20 or newer with corepack. pnpm comes from `frontend/package.json`
  (`packageManager`), so run it as `corepack pnpm` if `pnpm` is not on `PATH`.

## 1. Install

From the repository root:

```bash
git submodule update --init          # connector catalogue (extensions/workbuddy-connectors)
uv sync --locked --extra dev --extra serve --extra tracing --extra web --extra local-auth
cd frontend
corepack pnpm install --frozen-lockfile
```

The environment lives in `.venv/` (`.venv/Scripts/python.exe` on Windows,
`.venv/bin/python` elsewhere). Use `uv run <command>` to run anything in it.

## 2. First boot

```bash
cd frontend
corepack pnpm dev:check        # preflight: config file, interpreter, free ports
corepack pnpm dev:with-agent   # Agent backend + desktop
```

This starts the Agent backend on `127.0.0.1:8000` and the desktop on
`http://localhost:3000/#/desktop`. Configuration is chosen in this order:
`ECHO_AGENT_CONFIG`, an existing `config.local.yaml`, then
`config.example.yaml`. Copy the example to `config.local.yaml` to customise it.
`corepack pnpm dev:status` reports whether both services are ready.

## 3. Log in

The source-development entry binds to loopback only and keeps the admin login
passwordless (`ECHO_APPLIANCE_DEV_PASSWORDLESS=1`). Production entry points
never set that flag: a NAS appliance takes its first admin password from
`ECHO_ADMIN_PASSWORD` (or prints a random one once in the log), and the packaged
desktop app signs in to its own local account store under the app's user data.

## 4. First task

A model is required for real tasks. Either set the provider key that your
config names (for example `ANTHROPIC_API_KEY` for `config.example.yaml`), or
deploy a local model from **系统设置 → 模型与 Codex** (see
[LOCAL_MODEL_SETUP.md](LOCAL_MODEL_SETUP.md)).

Type a goal into the desktop intent box and press Enter, or open the Agent
workbench (工作台) from the Dock. The task runs as a durable background task.

## 5. Approval and result

When a step needs permission (file changes, network access, high-risk tools),
the task pauses and appears in **Task Space** with an approval card. Approve or
reject it there; the same turn then continues. The finished task keeps its
result, the verified file changes and the tool trace in Task Space.

## Other ways to run it

| Goal | Command |
| --- | --- |
| Desktop window (Electron) against the dev stack | `cd frontend && corepack pnpm electron:dev` |
| Backend only | `uv run python -m runtime serve --config config.local.yaml --port 8000` |
| Windows installer from source | `cd frontend && corepack pnpm electron:build:win` (needs the PyInstaller backend: `extras/desktop` → `pnpm backend:build:win` with the locked Python 3.11.9 `.venv`) |
| NAS appliance (Docker) | [deploy/appliance/README.md](../deploy/appliance/README.md) |
| Released installers | `Echo-Setup-*` assets on the GitHub Releases page of `dengdenghua/echo-os`, once a `v*` release is published |

## Common first problems

| Symptom | Try |
| --- | --- |
| `python` does nothing on Windows | It is the Microsoft Store stub; use `uv run …` or `.venv\Scripts\python.exe` |
| `pnpm` not found | `corepack pnpm …`, or `corepack enable` once |
| `dev:check` reports a missing dependency | Re-run the `uv sync` line from step 1 |
| Connectors list is empty | `git submodule update --init` |
| A task fails at the first model call | Configure a provider key or a local model (step 4) |

## What to read next

- Plain concepts: [CONCEPTS.md](CONCEPTS.md)
- Current architecture: [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md)
- Embedded workbench setup in depth: [ECHO_AGENT_INTEGRATION.md](ECHO_AGENT_INTEGRATION.md)
- NAS delivery gates: [NAS_DELIVERY_STATUS.md](NAS_DELIVERY_STATUS.md)
