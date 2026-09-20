# CI 门禁阻塞分析（2026-09-20）

基准：`p3-provision` @ `7342d137`（含桌面重构 + jsdom Blob.stream 修复）。全部结论基于
实证：GitHub Actions API 查询 + 本地复现，不做推测。

## 一、首跑总览

主 CI run `35512100296` 共 10 个 job，推送后实测：

| Job | 结论 | 说明 |
|---|---|---|
| Frontend quality and production build | **failure** | 见 §2 |
| Security scan | **failure** | Bandit ✓ → pip-audit ✗（见 §2） |
| GitHub Actions workflow contract | **failure** | 见 §3，**结构性阻塞** |
| Untracked source guard | success | 上轮修复生效 |
| Cross-platform pytest (macos-15) | success | |
| OMV host artifacts | success | |
| Cross-platform pytest (windows-2025) | 运行中 | |
| Cross-platform pytest (Python 3.12 observation) | 运行中 | |
| Public source contract (3.11.9 / 3.12.11) | 运行中 | |

此外 `behavioral-evidence.yml` 与 `engine-comparison-evidence.yml` 在每次 push 时都会
各产生一个 **零 job、秒失败** 的 run（`created` 与 `completed` 同一秒）。对照实验确认
API 权限足够（主 CI 的 10 个 job 均可见），所以"无 job"是真实状态。

## 二、前两个 job 与本次修复的关系（重要）

**Frontend job 的失败与代码质量无关，且导致本轮修复未被验证。**

精确失败步骤：

```
1. Set up job                        -> success
2. checkout / action-setup / node    -> success
5. Install dependencies              -> success
6. Frontend production dependency audit -> FAILURE  <<<
7. Verify frontend source quality    -> skipped
8. Run frontend and Electron contracts -> skipped   <<< pnpm test 在这里
9. Build production frontend         -> skipped
```

`pnpm audit --prod` 位于 `pnpm format / lint / typecheck / test / build` 之前，
它一挂，**后面四道门禁全部 skipped**。所以 `7342d137` 里修的那 3 条 jsdom
`Blob.stream` 用例，在 CI 上**根本没被执行**——不是修复失败，是没跑到。

本地等价验证（已做）：`vitest` 全量在该修复下这 3 条已转绿；相关 4 个文件 41 passed。

Security scan 方面 Bandit 已是 success，**pip-audit 是唯一失败步骤**。

处理建议：`pnpm audit --prod` 与 `pip-audit` 属依赖漏洞披露，需要定策略
（升级依赖 / 加豁免清单 / 拆成独立非阻塞 job）。**建议把 audit 从阻塞链里拆出去**，
否则任何一次依赖披露都会连带屏蔽掉 format/lint/typecheck/test/build 五道门禁。

## 三、workflow contract：一个结构性矛盾（需要决策）

### 3.1 本地复现

CI 该 job 唯一步骤是 `actionlint -shellcheck= -pyflakes=`（版本钉在 1.7.12）。
本地跑同一版本，**10 个错误**：

| 类型 | 数量 | 位置 |
|---|---|---|
| `[runner-label]` | 2 | `behavioral-evidence.yml:16`（`behavioral-evidence`）、`engine-comparison-evidence.yml:26`（`hardened-verifier`） |
| `[expression]` | 8 | 两个 evidence workflow 的 **job 级 `env`** 里使用 `${{ runner.temp }}` |

### 3.2 两类错误都成立

**`[runner-label]`**：actionlint 只在 `.github/actionlint.yaml` 登记了 `echo-os-image`，
而这两个 workflow 用了另外两个自托管标签。

**`[expression]`**：GitHub 的上下文可用性规则里，`jobs.<job_id>.env` 只放行
`github / inputs / matrix / needs / secrets / strategy / vars`，**不含 `runner`**。
在 job 级 env 写 `${{ runner.temp }}` 会被求值为**空串**，路径退化成
`/echo-behavioral-<run_id>-<attempt>` 这类**文件系统根目录绝对路径**，
后续 `mkdir -p "${ECHO_DATA_DIR}"` 必然失败。这不是风格问题，是真实缺陷。

### 3.3 但我修不了——修好会撞项目自己的测试契约

按上述两点修复后，actionlint **exit=0、10 个错误全清零**。代价是破坏 2 个测试：

```
FAILED tests/appliance/test_delivery_workflow_policy.py::
       test_workflow_linter_is_checksum_pinned_and_knows_the_dedicated_runner
   断言 actionlint 配置精确等于 {"self-hosted-runner":{"labels":["echo-os-image"]}}

FAILED tests/test_engine_comparison_evidence_workflow.py::
       test_protected_runtime_inputs_are_rechecked_without_publishing_auth_identity
   断言 job["env"]["ECHO_PROTECTED_IDENTITY_BASELINE"]
        .startswith("${{ runner.temp }}/echo-protected-identities-")
```

回退基线已验证：改前 **1 failed / 26 passed**（唯一失败是
`test_launcher_validate_cli_runs_as_an_isolated_absolute_script`，持续存在，
伴 `UnicodeDecodeError` 子进程解码告警，属既有环境项，与本次无关）。

**矛盾本质**：项目测试把两件与 actionlint/GitHub 规则冲突的事实**固化成了契约**——
①actionlint 配置只能登记一个 runner 标签；②`${{ runner.temp }}` 必须留在 job 级 env。
而 actionlint 要想通过，恰恰要求这两点不成立。**二者不可能同时满足**，
所以 workflow-contract job 是**结构性必红**，与代码质量无关。

### 3.4 三个候选方向（请择一）

| 方案 | 动作 | 代价 |
|---|---|---|
| **A. 承认 evidence runner 合法**（推荐） | 更新 `.github/actionlint.yaml` 登记两个标签；把 8 处 `runner.temp` 改为 step 内解析后写 `GITHUB_ENV`；同步更新上述 2 个测试的断言 | 需确认这两个自托管 runner 确实存在并受控 |
| **B. 让 evidence workflow 改用托管 runner** | 换 `runs-on`，并解决 `/Applications/ChatGPT.app/...` 与固化签名身份的依赖 | 语义上这些流程需要专用机，改动面大 |
| **C. 把 evidence workflow 移出 lint 范围** | actionlint 加忽略规则（如按文件排除） | 掩盖真实缺陷，不推荐；`[expression]` 那条是真 bug |

方案 A 的改动已实现并验证（actionlint exit=0），随后曾一度回退以确认测试基线。
**已确认采用方案 A 并落地，详见 §5。** 回退备份留在 `.workbuddy/wf-backup/`（3 个文件）。

### 3.5 附带发现：evidence workflow 为何每次 push 都秒挂

两个 workflow 都声明 `on: workflow_dispatch`（仅手动），但实测 run 的 `event` 是 `push`，
且零 job、秒失败、API 返回的 workflow `name` 是**文件路径**而非文件内的 `name:` 字段
（`engine-comparison-evidence.yml` 的 name 却是正常的）。结合 3.2 的真实缺陷，
怀疑这批 workflow 从未在任何 runner 上成功执行过。建议在方案 A 落地后，
用 `workflow_dispatch` 手动各触发一次确认。

## 四、结论

- 本轮代码修复（`7342d137`）本身有效，但被 `pnpm audit --prod` 挡在 CI 验证之外。
- CI 有两道**与代码质量无关**的阻塞：依赖审计策略未定、workflow contract 契约自相矛盾。
- 建议优先级：先拆开 audit 阻塞链（低风险、立刻恢复 5 道门禁）→ 再定 workflow
  contract 方向（§3.4）→ 最后手动验证 evidence workflow 能否真正跑起来。

## 五、方案 A 实施记录（2026-09-20）

已按方案 A 落地，共改 5 个文件：

| 文件 | 改动 |
|---|---|
| `.github/actionlint.yaml` | 在 `self-hosted-runner.labels` 追加 `behavioral-evidence`、`hardened-verifier` |
| `.github/workflows/behavioral-evidence.yml` | 从 job 级 env 移除 3 处 `runner.temp`，新增 `Resolve run-scoped paths` step 写入 `GITHUB_ENV` |
| `.github/workflows/engine-comparison-evidence.yml` | 同上，5 处（含 `ECHO_PROTECTED_IDENTITY_BASELINE`） |
| `tests/appliance/test_delivery_workflow_policy.py` | 断言由"仅 echo-os-image"更新为三个标签齐全 |
| `tests/test_engine_comparison_evidence_workflow.py` | 断言由"job env 里 startswith `${{ runner.temp }}`"更新为校验新 step 中的解析，并断言该变量**不再**出现在 job 级 env |

测试契约的**意图未变**，只是把被固化的事实更新为与 actionlint/GitHub 规则一致：
路径仍绑定 run 唯一的临时目录、actionlint 配置仍须覆盖全部专用 runner。

### 验证

- `actionlint -shellcheck= -pyflakes=`（v1.7.12，与 CI 同版同参）：**exit=0**，10 个错误全清零
- 两个 workflow 全部 shell 步骤 `bash -n`：13 / 17 步，**0 失败**
- workflow 相关测试 9 个文件：**1 failed / 128 passed**，与改前基线一致，
  唯一失败是既有的 `test_launcher_validate_cli_runs_as_an_isolated_absolute_script`
  （伴 `UnicodeDecodeError` 子进程解码告警，属环境项，与本改动无关）

### 仍待处理（不在本次范围）

- `pnpm audit --prod` 与 `pip-audit` 的阻塞链拆分（§2 建议）尚未实施。
- evidence workflow 能否在真实 runner 上跑通**尚未验证**——它们此前大概率从未成功
  执行过（§3.5）。方案 A 修的是"能不能被调度/校验通过"，**不等于**流水线业务逻辑
  已被验证。建议用 `workflow_dispatch` 手动各触发一次确认。

## 六、方案 A 推送后的 CI 实证（2026-09-20 晚）

### 6.1 推送落地与方案 A 判据

`083fb20a` 已推送到 `upstream/p3-provision`（`git ls-remote` 复核一致）。

| 判据 | 前（7342d137） | 后（083fb20a） |
|---|---|---|
| `GitHub Actions workflow contract` | failure | **success** |
| 失败 job 数 | 6 | 5 |
| push 触发的 workflow 数 | 3（CI + 2 个 evidence） | 1（仅 CI） |

两个 evidence workflow 此前每次 push 都产生一个**瞬间失败的 run**，本次不再产生。
原因不是"它们会随 push 运行"（其 `on:` 只有 `workflow_dispatch`），而是
**GitHub 会对 push 中被修改的 workflow 文件做校验**，文件里存在非法表达式
（job 级 `env` 中的 `${{ runner.temp }}`）即判失败。方案 A 修好后这类伪失败消失。

⚠️ 这**只说明"可被校验通过"**。两个 evidence workflow 依赖自托管 runner
（`behavioral-evidence` / `hardened-verifier` 标签）与 protected environment，
其业务逻辑能否真正跑通**仍未验证**，需 `workflow_dispatch` 手动触发。

### 6.2 实测发现：前端质量门禁此前是零覆盖

`Frontend quality and production build` job 的第 7/8/9 步
（`Verify frontend source quality`、`Run frontend and Electron contracts`、
`Build production frontend`）**在该分支 5 次 CI 里从未执行过一次**——全部被
第 6 步 `Frontend production dependency audit` 挡死并 skip。也就是说
format / lint / typecheck / test / build 这 5 道门禁，此前一天的价值是零。

### 6.3 release/delivery 门禁的 3 个真实失败（已修）

本地复现 `deploy/appliance/run_public_source_tests.py`：
**5 failed / 3041 passed / 105 skipped**。逐条定性：

| 失败用例 | 定性 |
|---|---|
| `test_operations_bundle.py` × 3 | **真缺陷**（见下） |
| `test_omv_plugin_package.py::test_native_plugin_is_accepted_by_system_debian_archive_tools` | 本机环境：Git-Bash 的 `tar` 把 `C:\...` 当远程主机（`Cannot connect to C:`），CI 的 Linux 不会 |
| `test_host_mcp.py::test_saved_thread_preserves_current_permission_choice[bypassPermissions-True-bypassPermissions-local]` | 本机环境：`runtime/platform/process/scope.py:568` 用 `Path.cwd().anchor` 当文件系统根，仓库在 D: 而 `tmp_path` 在 C:，故 `allows_read` 判为越界 |

**真缺陷根因**：`deploy/appliance/operations_systemd.py` 的导入回退链

```python
try:
    from deploy.appliance.external_storage import ExternalStorageError, verify_external_storage
except ModuleNotFoundError:
    from external_storage import ExternalStorageError, verify_external_storage
```

因此任何"解包后独立运行"的验证都必须带上 `external_storage.py`。
该文件在归档里是有的（`deploy/appliance/operations_bundle.py` 的 `SOURCE_FILES` 第 63 行），
但 `tests/appliance/test_operations_bundle.py` 里三处解包清单漏了它；
同一文件的 `nas_data_backup` 用例（第 151 行）**本来就带了它**，可见是漏改而非约定变更。
引入点是 `1c6041d5`（2026-08-31，`complete independent platform migration`），
即 OMV → 原生方案迁移时给 `operations_systemd.py` 加了该 import，却漏更新这三处清单。

修复：补 3 处解包清单（`btrfs` 那处还缺 `operations_systemd_lab.py`、
`storage_recovery_lab.py`）。断言强度不降反升——`files[name]` 取不到会直接 `KeyError`，
等于强制归档必须包含这些文件。→ `test_operations_bundle.py` **12 passed**。

门禁失败点的历史迁移：`Ruff check and format`（已修）→
`Test the OS-owned release and delivery contracts`（本次修）。门禁是分层阻塞，
每修好一层就露出下一层。

### 6.4 两个依赖审计：全部可在现有大版本内清零

**前端 `pnpm audit --prod`** —— 8 条公告 / 3 个包（3 high、3 moderate、2 low，
其中 6 条集中在 `react-router`）：

| 包 | 原版本 | 需 ≥ | 修后 | 修法 |
|---|---|---|---|---|
| `react-router(-dom)` | 7.15.0 | 7.18.2 | **7.18.4** | `^7.14.0` 已允许，纯锁文件刷新 |
| `nanoid` | 5.1.11 | 5.1.16 | **5.1.16** | `^5.1.6` 已允许 |
| `@ai-sdk/provider-utils` | 4.0.27 | 4.0.33 | **4.0.51** | 随 `ai` 6.0.33 → 6.0.286 进位 |

**关键点：三个包声明的 semver 区间本来就覆盖修复版本**（`^7.14.0` / `^5.1.6` /
`^6.0.33`），是**锁文件与区间脱节**造成的假阻塞，而不是需要跨大版本升级。
一次 `pnpm update react-router-dom nanoid ai` 即可 —— 结果：`No known
vulnerabilities found`，**exit=0**。锁文件仅 6 个包变更。

⚠️ 同一个命令会**顺带把 `package.json` 的声明区间改写成新版本**
（`^7.14.0` → `^7.18.4` 等），必须与锁文件**一起提交**：CI 的安装步骤是
`pnpm install --frozen-lockfile`，而锁文件的 importers 段记录的是
`specifier: ^7.18.4`；若只提交锁文件、不提交 manifest，二者不一致会直接报
`ERR_PNPM_OUTDATED_LOCKFILE`，前端 job 会比原来更早挂掉。
（把声明下限抬到已修补版本本身也更稳妥：将来任何一次锁重解析都不会退回 7.15.0。）

**Python `pip-audit`** —— 只有 `anyio 4.13.0`（CVE-2026-63374 / CVE-2026-64847，
修复版本 4.14.2），且是全传递依赖（`anthropic` / `httpx` / `mcp` / `sse-starlette` /
`starlette` / `watchfiles` / `httpx2` 七个包依赖它），`pyproject.toml` 中并无直接声明。
`uv lock --upgrade-package anyio` → **4.14.2**，锁文件仅 3 行变更、只动 anyio。

复验按 **CI 的真实依赖范围**（`--extra dev --extra serve --extra mcp`，93 个包）导出后
用 `pip-audit -r ... --no-deps -s osv` 审计 → `No known vulnerabilities found`。

⚠️ 本机 venv 因装了 `mantle-ssh` 而含有 `paramiko`，其锁定版本 **4.0.0 存在
PYSEC-2026-2858 且上游暂无修复版本**。该 extra 不在 CI 任何 job 的同步范围内，
故当前不影响 CI；但若后续给 CI 增加 extras，会立即踩到。

### 6.5 仍未验证 / 未处理

- 上述所有修复的 **CI 结论尚未取得**（需下一次 push 才能观测）。
- `pnpm audit --prod` 与 `pip-audit` 的**阻塞链拆分**（§2 建议）**未做**。
  现在两个审计都能过，拆分不再是获取前端门禁信号的**前提**，
  但"审计失败即 skip 掉后续 5 道门禁"的结构性隐患仍在：一旦将来审计再次不通过，
  格式 / lint / 测试 / 构建会再次静默消失。建议改为 `continue-on-error` 或独立 job。
- 两个 evidence workflow 的真实可执行性（§6.1）。
- 本机 `.venv` 与 `uv.lock` 的残余漂移（`jiter` 0.16.0 vs 0.14.0、
  `pywin32` 312 vs 311），需停掉占用进程后才能收敛。

---

## 7. CI run 35517059098 的 step 级诊断（2026-09-20 22:40–23:10）

### 7.1 失败面（公开 API 实证）

`/actions/runs/{id}/jobs` 在公开仓库上**无需鉴权**即可读到 **step 级 conclusion**
（job 日志仍需鉴权）。本次 12 个 job 的结论：

| job | 结论 | 失败 / 跳过的 step |
|---|---|---|
| `Public source contract (3.11.9)` | failure | step 08 `Test the OS-owned release and delivery contracts` |
| `Public source contract (3.12.11)` | failure | step 08（同上） |
| `Frontend quality and production build` | failure | step 07 `Verify frontend source quality` |
| `Full suite (3.12, observation)` | failure | step 07 `Run the whole suite`（`continue-on-error: true`） |
| `Lint + Test` ×2 | **skipped** | `needs: public-source-contract` → 级联 |
| `Docker build test` | **skipped** | `needs: public-source-contract` → 级联 |
| 其余 6 个 | success | — |

两点要紧：

- `Public source contract` 的 **step 01–07 全部 success**，其中含
  `Ruff check and format`。故本次 red 与 ruff / source policy / 依赖锁**均无关**，
  纯粹落在 step 08 的 pytest 门禁上。
- **级联放大**：`public-source-contract` 是 `lint-and-test` 与 `docker-build` 的 `needs`，
  它一红，两个最重的 job（完整 pytest、全栈冒烟、覆盖率、延迟门禁）**整体跳过**。
  换言之当前 CI 只在跑源契约切片，主干测试根本没执行。

### 7.2 前端 step 07 的确切原因（已定位）

step 07 的内容是：

```yaml
run: |
  pnpm format      # = prettier --check .        ← check 模式，非写入
  pnpm lint        # = eslint . --ext .ts,.tsx --max-warnings=0
  pnpm typecheck   # = tsc --noEmit
```

第一条 `pnpm format` 失败即终止，后两条不执行。

用干净 worktree 检出 `03d8a281`（+ junction 复用主仓 `node_modules`），
在**未被工作区未提交改动污染**的 HEAD 树上跑 CI 原命令：

```
[warn] … Code style issues found in 15 files. Run Prettier with --write to fix.
```

即 **HEAD 自身就有 15 个文件不符合 prettier**。`frontend/` 下无 `.prettierrc`
（只有 `.prettierignore`），故走 prettier 默认配置。

> 数字校正（2026-09-21 实测）：在并入全部工作区改动**之前**、`--write` 之前跑
> `prettier --check .`，实测为 **11 个**违规文件（不是 7）：`agent-pip-monitor.{tsx,test.tsx}`、
> `ai-network-pulse.{tsx,test.tsx}`、`desktop-start-guide.{tsx,test.tsx}`、
> `intent-desktop-surface.{tsx,test.tsx}`、`macos-shell.{tsx,test.tsx}`、`styles/macos-desktop.css`。
> 即这 11 个**全部**落在 §7.3 的第二类（外部在途）文件上——所以"只提交第一类"的方案
> 一开始就不可能让 step 07 转绿。§7.3 里"15 个中的 7 个"这一说法据此作废。

> 方法说明：worktree + `New-Item -ItemType Junction` 复用 node_modules，
> 可在不碰主工作区的前提下复现 CI 的任意"对 HEAD 求值"命令。
> 这比 `git stash` 安全，适合存在大量未提交改动时使用。

### 7.3 工作区未提交改动的两类来源（必须分开处理）

`git diff --stat`：19 个文件、2381 插入 / 503 删除，但性质完全不同：

| 来源 | 文件 | 规模 | 结论 |
|---|---|---|---|
| 本会话上轮重构 + 顺带修格式 | `page.tsx`、`use-desktop-appearance.{ts,test.ts}`、`use-liquid-glass-pointer.ts`、`use-system-controls.{ts,test.ts}`、`use-system-updates.ts`、`file-shares.test.ts`、`dock.test.tsx`（9 个） | 4–52 行/文件 | 可提交 |
| **外部在途的功能开发** | `intent-desktop-surface.{tsx,test.tsx}`（1275/159）、`macos-shell.{tsx,test.tsx}`（447/171）、`agent-pip-monitor.{tsx,test.tsx}`（262/71）、`ai-network-pulse.{tsx,test.tsx}`（19/12）、`desktop-start-guide.{tsx,test.tsx}`（105/15）、`styles/macos-desktop.css`（201） | 合计约 2100 行 | **未动，待确认归属** |

**阻塞点**：HEAD 的 15 个格式违规中有 **7 个落在第二类文件上**。
不碰它们 → step 07 必红；碰它们 → 会把尚未完成的开发改动一并提交。
必须由作者确认后才能推进。

### 7.4 本地 skip 基线（= Linux 侧真跑清单）

Windows 上跑 `tests/appliance` 中含平台 marker 的 10 个文件：

```
160 passed, 34 skipped in 23.45s
```

其中在 Linux（CI 的 `ubuntu-24.04`）上**会新增真跑 29 个**：

| 文件 | Linux 新增 | skip 原因 |
|---|---|---|
| `test_document_worker_environment.py` | 9 | real Linux ownership and mode |
| `test_document_process_linux.py` | 4 | real Linux /proc, rlimit, parent-death signal |
| `test_docker_credential.py` | 4 | root-owned POSIX credential contract |
| `test_file_organization_io.py` | 3 | Linux renameat2 / name-capture race / pathname race |
| `test_file_rollback_io.py` | 3 | POSIX permissions, xattrs, symlinks |
| `test_document_process_limits.py` | 2 | real Linux rlimit/prctl |
| `test_nas_backup_recovery.py` | 2 | POSIX ownership and modes |
| `test_file_organization_directories.py` | 1 | Linux dirfd and mode |
| `test_docker_proxy.py` | 1 | POSIX unix socket |

`test_iso_workspace_admission.py` 的 5 个在 CI 上**仍会 skip**（需要 `xorriso`/`cpio`，
而该 job 只做 `uv sync`，不安装系统包），可排除。

这就是"本地全绿、CI 红"的结构性来源：**近 30 个 POSIX 契约断言在 Windows 上从不执行**。
它们的实现其实相当谨慎——用 `monkeypatch.setattr(os, "geteuid", …)` 伪造 euid、
`monkeypatch.setattr(Path, "stat", …)` 伪造 owner，并不依赖真 root——
所以**失败点无法靠静态阅读推定**，必须在真 Linux 上实测。

### 7.5 结算：step 07 三条命令转绿（2026-09-20 23:5x）

§7.3 第二类改动的归属已确认（作者批准一并提交），三条命令的并前/并后对照：

| 命令 | HEAD（并入前） | 工作区（并入后） |
|---|---|---|
| `pnpm format` = `prettier --check .` | 15 文件违规 | **0** — `All matched files use Prettier code style!` |
| `pnpm lint` = `eslint . --ext .ts,.tsx --max-warnings=0` | 未执行（被上一条挡住） | **0**（原 21 warnings） |
| `pnpm typecheck` = `tsc --noEmit` | **exit 2**（6 错，全在 `page.tsx`） | **0** |

**核心结论：HEAD 自身不可编译。** `page.tsx` 引用了 `macos-shell.tsx` 尚未导出的
`MacWorkspaceDropdown`，而工作区那批在途改动正是补齐它的另一半。即
"HEAD 是一个半成品提交 + 另一半从未提交"——这正是此前"本地全绿、CI 红"并存的机制之一。

21 条 eslint warning 全部落在 4 个文件、且全部是死代码：

| 文件 | 条数 | 处置 |
|---|---|---|
| `agent-pip-monitor.tsx` | 4 | 删未使用图标 import：`BotIcon`/`CheckIcon`/`ExternalLinkIcon`/`Minimize2Icon` |
| `ai-network-pulse.tsx` | 7 | 同上（`ActivityIcon`/`BotIcon`/`CpuIcon`/`GlobeIcon`/`ShieldCheckIcon`/`SparklesIcon`/`ZapIcon`） |
| `intent-desktop-surface.tsx` | 9 | 6 个未使用图标 import；死 `useMemo`（`filteredTasks`，下方 IIFE 内有等价活计算）；`useEffect` 补漏声明的 `inspectingAsset` 依赖 |
| `macos-shell.tsx` | 1 | 删死变量 `isSecondaryMenu`（`index === 0` 已内联进 className） |

> **踩坑记录（会重犯）**：`eslint` 与 `prettier --write` **并发执行**时，eslint 可能读到
> 格式化**前**的快照，其报告行号会整体偏移（本例 react import 被折行，偏移 +5）。
> 若按行号去对应标识符，就会删掉仍在使用的 import。本次即因此误删了
> `appliance/agent-pip-monitor.tsx` 的 `Maximize2Icon`（实际用于第 373 行），由 `tsc` 兜住。
> **正确做法：按标识符名映射，且两条命令串行跑。**

> **踩坑记录之二：工作区 CRLF 会造成 `git status` 假 ` M`。**
> 本仓库 `core.autocrlf=true`，且 `.gitattributes` 对源码声明 `text=auto, eol=lf`。
> 实测（受控实验，见下）：把工作区文件转成 CRLF 后
>
> | 操作 | `git status --porcelain` | `git diff` |
> |---|---|---|
> | 工作区为 CRLF | ` M <file>` | **空** |
> | 再 `git add` | **空（变干净）** | 空 |
>
> 且 git 自己会警告 `CRLF will be replaced by LF the next time Git touches it`。
> 即**纯行尾差异既不出现在 `git diff --stat` 里，又会让 `git status` 报修改，一 `add` 就消失**。
> 判据：`git status` 的条目数比 `git diff --stat` 的文件数多出的那一个，就是它。
>
> 本次即如此：会话开始时 `git status` 列 21 个 `M`，`git diff --stat` 只有 20 个文件——
> 差额正是 `appliance/dock.test.tsx`。`git cat-file blob HEAD:<file>` 的原始字节与该文件
> 逐字节相同（`git hash-object --no-filters` 两侧均为 `30582c0f…`），故**无任何内容丢失**，
> 只是行尾差异。该文件因此不在本次提交范围内（它本就没有实质改动）。
> 另：`git grep -l -P '\r$' HEAD -- frontend/src` = **0 / 1530**，即仓库内并无 CRLF 入库的
> blob，不需要 `git add --renormalize`。

#### 一处仍未接线（非门禁问题，未擅自补实现）

`IntentDesktopSurfaceProps.onOpenApp` 在 `page.tsx:1604` 有真实接线（查 `visibleDesktopApps`
后调 `openApp`），但 `intent-desktop-surface.tsx` 内**零调用点**——对比 `onOpenWorkbench`
有 6 处调用——且该组件内并无 app 网格。本次只在解构处摘除以免 lint 报错，
**接口声明与父侧接线均保留**，待组件补上 app 入口时再接回。

### 7.6 Linux 侧 step 08 复现结论（WSL2，与 CI 等价）

本机装好 WSL2（免重启，方法见 skill `win-wsl-install-no-reboot`）后，在 **ext4** 上克隆同一
commit 并执行 `deploy/appliance/run_public_source_tests.py`：

| 运行身份 | 结果 |
|---|---|
| root | 32 failed，其中 25 个是 `HostInstallError: Echo OMV group GID must be a positive integer` ——**root 组 GID = 0，不是正整数**，属伪失败 |
| `runner`（uid 1000） | **130 failed** ← 与 CI 等价的那次 |

根因单一且集中：`appliance/native_btrfs.py:110` 的 `_safe_directory` **硬编码 `st_uid == 0`**：

```python
if os.name == "posix" and (info.st_uid != 0 or info.st_mode & 0o022):
    raise OSError(f"{description} ownership or mode is unsafe")
```

测试在 pytest `tmp_path` 下造目录，属主是当前用户而非 root，故必然失败。同一模式散落在
storage / mdadm / fstab / operations bundle / systemd unit / firewall / webdav /
docker credential 等处。

**结论：这批 POSIX 契约测试从未在 Linux 上通过过。** §7.4 的"近 30 个 POSIX 断言在 Windows
上从不执行"只解释了覆盖面差异，真实失败面是 130 个，且原因不是环境差异，而是
**实现假定了进程以 root 运行**。

处置方向（三选一，**未决，需拍板**）：

1. CI 以 `sudo -E` 运行 step 08——改动最小，但等于把"必须以 root 运行"固化为契约；
2. 非 root 时把这批测试标记 skip——诚实，但等于放弃 Linux 覆盖面；
3. 改判定逻辑：仅在路径确属系统目录时要求 root 属主，`tmp_path` 场景放宽——改的是实现而非测试，收益最实但风险最高。

> 复现方法上的硬约束：**必须克隆到 ext4**。`/mnt/d` 为 DrvFs，`chmod`/`chown`/xattr/
> `renameat2` 语义不全，会在同一批 POSIX 测试上制造**假失败**，反而误导结论。
> 另：`uv sync --locked` 不要设 `UV_DEFAULT_INDEX` 指向镜像——`uv.lock` 记录了包来源，
> 换索引会被判为 lockfile 过期（CI 上这步是绿的）。

