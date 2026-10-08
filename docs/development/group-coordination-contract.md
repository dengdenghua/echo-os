# Group coordination production contract

The application now constructs one `CoordinationService` over its existing
`GroupStore`, `CollaborationStore` and `AsyncWorkStore`. The same service backs
the `collaboration` tool, task APIs, queue admission and completion observer.
The real application factory exposes its service through
`app.state.cowork_runtime.coordination`.

The canonical APIs are:

- `GET /api/collab/{thread_id}/coordination`
- `POST /api/collab/{thread_id}/coordination/tasks` with `assignee`, `prompt`,
  stable `request_id`, and optional same-group `dependencies`.
- `POST /api/collab/{thread_id}/coordination/receipt` with `task_id`, `action`
  (`ack` or `cancel`), and `message_id` for acknowledgment.

Client bodies cannot supply an actor, tenant or execution policy. The host
captures canonical thread metadata and the resolved principal. Delayed work
restores an immutable `ExecutionTask` permission ceiling and deadline, then
revalidates current member and thread/room authority before execution and each
continuation. Timeout bridge workers also rebind the immutable request, and
locked-worktree ephemeral writes intersect it before reaching the handler.
Dependency failure blocks dependent work. Acknowledgment records
receipt and does not prove artifact validation or start another task.

Late coordination messages are delivered as explicitly untrusted data, with
no implicit acknowledgment. Continuation requires the existing worker session
ID and is bounded to four calls and the original deadline; further messages
stay pending in the inbox. Chat mode still requires the human to assign
background work. Existing non-coordination task APIs retain their legacy
behavior; this change does not migrate their historical records or grant them
new permissions.

ToolExecutor, lightweight native dispatch, ephemeral tools, execute_skill,
use_capability and forged composites share the host resource guard. A declared
exclusive resource (including browser control) cannot run while another task
in the same cowork store owns it. Independent data roots have separate
ledgers; this is not a machine-wide lock shared by unrelated Echo instances.
Task completion/cancellation prevents subsequent tool dispatch.
Cancellation fences the durable queue result; it cannot undo an external
effect already performed or forcibly interrupt an in-flight provider call.

## CI and local validation

`coordination-contract` in `.github/workflows/ci.yml` is blocking and executes
the coordination regressions, production wiring, async runner, group router,
collaboration store cutover and CI contracts with `--runxfail`. The former
three expected failures now execute normally; a source contract also prevents
adding xfail decorators back to the coordination regression file.

Run the same tests from the repository root with the project's Python:

```powershell
.\.venv\Scripts\python.exe -B -m pytest tests/test_group_coordination.py tests/test_coordination_production_wiring.py tests/test_cowork_async_runner.py tests/test_cowork_group_router.py tests/test_collaboration_store_cutover.py tests/test_ci_gate_contract.py --runxfail -q --timeout=60 -p no:cacheprovider
```

The existing full-suite observation job retains `continue-on-error: true`.
Its recorded reason is the September audit's 120 failures and intermittent
hangs outside the default appliance test collection. This focused repair has
no fresh Linux full-suite success evidence, so it cannot justify converting
that unrelated debt into a blocking gate. The full suite still emits JUnit
and a failure summary; no tests or observation failures were removed.

All local coordination tests use temporary stores and stub subagent execution.
They do not invoke real models, browser/device actions or background servers.
On Windows the existing POSIX-only open-SQLite deletion test is skipped.
`test_no_untracked_source_files` intentionally rejects uncommitted newly added
source files; keep it enabled in CI after adding the changes to Git. It is
also enforced by the existing independent untracked-source blocking job.
