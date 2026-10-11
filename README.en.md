# Echo OS

Echo OS is the Echo family's always-on private-cloud execution environment, deployed on a user-owned server, NAS, or private VM. The Agent runtime, browser-based desktop, launcher, files, and system capabilities ship as one versioned distribution. Its workbench is the private-cloud management and execution surface.

中文读者：[README.md](README.md)

## The Echo product family

| Product | Positioning | Usage and execution |
| --- | --- | --- |
| [Echo AI](https://github.com/dengdenghua/echo-ai) | Desktop AI workspace | Deep work with local files, code, applications, and tools; the interaction reference is Codex on desktop. |
| [Echo Mobile](https://github.com/dengdenghua/echo-mobile) | Mobile AI entry point | Conversations, voice interaction, task initiation, and results on a phone; the interaction reference is GPT conversations on mobile. |
| [Echo OS](https://github.com/dengdenghua/echo-os) | Always-on private-cloud execution environment | Runs on a user-owned server, NAS, or private VM for background tasks, browsers, and computation; the execution reference is a Dot's cloud computer. |

These are product roles and the intended integration direction, not a claim that all cross-device features are implemented. Desktop tasks can execute locally, and desktop or mobile clients can connect to private-cloud execution. Assistants and White Ghost squads are execution members; nodes are execution environments, without a required one-to-one mapping. Shared identity, projects, tasks, and execution nodes are the integration direction. Consult each repository for implementation status.

`echo-agent` remains the embedded Agent capability and compatibility command; `echo-enterprise` and `echo-storage` are related enterprise and data services.

## Repository layout

| Path | Purpose |
| --- | --- |
| `appliance/` | OS device layer: app registry, authentication, extensions, files, and system services |
| `frontend/` | Desktop UI shell |
| `tests/appliance/` | Authoritative OS appliance tests |
| `deploy/` | Image, Docker, Kubernetes, host, recovery, and delivery tooling |
| `docs/` | Active OS architecture, onboarding, operations, and archived Agent references |

## echo-storage (File Agent) integration

Echo OS does not duplicate document indexing. It talks to the sibling
`echo-storage` project through a narrow HTTP API:

- The desktop launcher opens the File Agent workspace.
- The NAS file manager can call `/v1/search` and `/v1/answer`.
- Uploads are staged and atomically committed; copy, move, directory creation,
  multi-file selection, downloads, and trash are supported.
- Set `ECHO_STORAGE_AUTOSTART=1` to start `echo-storage serve` in the
  background. Failure is isolated from the rest of the OS.
- Override the endpoint with `ECHO_STORAGE_URL`,
  `ECHO_STORAGE_HOST`, or `ECHO_STORAGE_PORT`.

## Quick Start

```bash
# Install the unified development environment from this repository.
make install

# Build a source-verified Agent bundle, then start the appliance stack.
make agent-bundle
make up

# Run the appliance contract and integration tests.
make test
```

For local QA snapshots, device deployment, and recovery procedures, see the
[NAS deployment guide](deploy/appliance/README.md).

## CLI

The unified installation exposes `echo` as the primary command and keeps
`echo-agent` as a compatibility alias for existing automation.

## Reflection closure

Agent execution, verification, replay evidence, memory promotion, and rollback
all live inside this repository and release as one Echo OS version.

## License and upstream components

Echo OS is distributed under Apache-2.0. Bundled OpenAI components retain their
own notices and license files in the release artifacts.

To run the embedded workbench with the OS backend:

```bash
cd frontend
pnpm dev:with-agent
```

This starts the Agent backend on `127.0.0.1:8000` and the only frontend on port
3000. The full setup is documented in
[Echo Agent workbench integration](docs/ECHO_AGENT_INTEGRATION.md).

Start with the [documentation ownership map](docs/README.md), the
[OS architecture](docs/architecture.md), and the
[Echo OS ↔ Echo Agent engineering boundary](docs/AGENT_OS_BOUNDARY.md).

The NAS product-delivery boundary and remaining physical acceptance gates are
tracked in [NAS_DELIVERY_STATUS.md](docs/NAS_DELIVERY_STATUS.md).
