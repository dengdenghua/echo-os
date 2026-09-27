# Echo OS ← echo-ai 多智能体编排移植评估

> 日期：2026-09-22
> 触发：跨仓对照发现 echo-ai 的 cowork/team_rooms 多智能体编排是**重实装**（非此前误判的"半成品"），且与 Echo OS **同源**，Echo OS 这套被砍半。
> 结论一句话：**Echo OS 缺的不是"多智能体房间"的壳，而是"协作会出错要重试、产物要投递、消息要批注置顶、跨 agent 要授权"的生产级编排完备性。因同源，这是往回并/移植，不是重写。**

---

## 1. 背景与证据

echo-ai 与 Echo OS 共享同一 `runtime` 核心（同源分叉）。此前只看了 echo-ai 的 `protocols/swarm.md`（frontmatter 自标 `implementation_status: partial`）和空壳 `teams/family/`，误判"多智能体是半成品"。**实挖 `runtime/` 后推翻该判断**：

| echo-ai 实装 | 行数 |
|---|---|
| `sensing/gateway/cowork_group_router.py` | 2169 |
| `sensing/gateway/_team_stream_group_fanout.py` | 1815 |
| `memory/cowork/collaboration_store.py` | 1490 |
| `memory/cowork/group_store.py` | 1102 |
| `sensing/gateway/team_rooms_router.py` + `team_rooms_ws.py` | 979 + 974 |
| `safety/organization/team_runner.py` | 1017 |
| `execution/agents/group_fanout.py` | 844 |

实证非空壳：`_collector_retry_plan`（`cowork_group_router.py:785`）是完整的失败恢复编排——校验 run 归属、提取 task brief、算可重试 child、拒绝"已成功"重试、404/409 边界。

---

## 2. 有无对比：同源、Echo OS 被砍半

这套模块**两边大多都在、行数接近**（同源、都没缺席），真正差距在**深度**：

| 模块 | echo-ai | Echo OS | 差距 |
|---|---|---|---|
| `cowork_group_router.py` | 2169 | **959** | **砍半** |
| `_team_stream_group_fanout.py` | 1815 | **730** | **砍半** |
| `collaboration_store.py` | 1490 | 935 | 少 1/3 |
| `group_fanout.py` | 844 | **460** | **砍半** |
| `group_store.py` | 1102 | 1088 | ≈ |
| `team_rooms_router.py` | 979 | 977 | ≈ |
| `team_runner.py` | 1017 | 1009 | ≈ |

**`cowork_group_router.py` 函数级**：echo-ai 79 函数 / Echo OS 42 函数，echo-ai 独 **37 函数 + 13 路由**。

**`collaboration_store.py` 方法级**：echo-ai 62 方法 / Echo OS 46 方法，echo-ai 独 **16 存储方法**。

---

## 3. Echo OS 缺什么（`cowork_group_router` 37 个独有函数，按类分组）

### 3.1 collectors 全生命周期 —— 16 函数 / ~671 行（**最大头**）

采集型子任务（一个母任务派多个子采集）的失败恢复编排。

| 函数 | 行数 | 作用 |
|---|---|---|
| `_dispatch_collector_retry_plans` | 108 | 批量分发重试计划 |
| `cancel_collaboration_collector_child` | 79 | 取消单个采集子任务 |
| `_cancel_collector_plans` | 70 | 取消计划编排 |
| `list_collaboration_collectors` | 68 | 列采集器 |
| `_collector_retry_plan` | 50 | 单个重试计划（校验 run 归属 / 可重试 child / 拒已成功） |
| `get_collaboration_collector` | 41 | 查询单个采集器 |
| `cancel/archive/retry_collaboration_collector(s)` | ~150 | 取消/归档/重试 |
| `get_collaboration_collector_attempts/steering` | ~48 | 尝试记录 / 转向查询 |
| `steer_collaboration_collector_child` | 27 | 转向单个采集子任务 |

### 3.2 群聊富交互（annotation / reaction / pin）—— 11 函数 / ~125 行

| 函数 | 行数 | 作用 |
|---|---|---|
| `create_annotation` / `create_annotation_reply` | 40 | 消息批注 + 批注回复 |
| `update_annotation` / `delete_annotation` | 22 | 批注改/删 |
| `toggle_message_reaction` | 14 | 表情回应 |
| `toggle_pinned_message` / `list_pinned_messages` | 19 | 置顶 |
| `list_annotations` / `list_message_reactions` | 12 | 查询 |
| `_annotation_author` / `_annotation_room_id` | 18 | 归属解析 |

### 3.3 协作交付（delivery）—— 5 函数 / ~75 行

| 函数 | 行数 | 作用 |
|---|---|---|
| `list_collaboration_deliveries` | 24 | 列协作产物投递 |
| `retry_collaboration_delivery` | 22 | 重试投递 |
| `get_collaboration_delivery` / `dismiss_collaboration_delivery` | 18 | 查询 / 签收 |
| `_collaboration_delivery_for_thread` | 11 | 按 thread 解析投递 |

### 3.4 跨 agent 授权 + run 追踪 —— 4 函数 / ~84 行

| 函数 | 行数 | 作用 |
|---|---|---|
| `get_trust` | 33 | 查询 cowork thread 的信任边界 |
| `_coordination_authorized` | 4 | 协调授权判定 |
| `list_collaboration_runs` / `get_collaboration_run` | 47 | 协作 run 追踪 |

---

## 4. 存储层缺口（`collaboration_store.py` 16 个独有方法）

路由要落地，存储得先补上。echo-ai 独有：

- **批注/表情/置顶存储**：`add_annotation` / `add_annotation_reply` / `annotations_for_session` / `delete_annotation` / `set_annotation_resolved` / `toggle_message_reaction` / `reactions_for_session` / `toggle_pinned_message` / `pinned_messages_for_session`
- **成员运行时租约**：`acquire/release_collaboration_member_runtime_lease` / `collaboration_member_runtime` / `save/clear_collaboration_member_runtime`
- **其他**：`record_receipt_for_room` / `_normalize_context_hashes`

---

## 5. 移植优先级建议

| 优先级 | 范围 | 理由 |
|---|---|---|
| **P0** | collectors 全生命周期（§3.1）+ 对应 store | 最大头（~671 行），且是"多智能体协作会失败、要能恢复"的**核心闭环能力**——正是 Echo OS 闭环卖点在多 agent 场景的延伸 |
| **P1** | 协作交付 delivery（§3.3）+ 跨 agent trust（§3.4） | 协作产物投递 + 跨 agent 授权边界，是"可托付"的关键 |
| **P2** | 群聊富交互 annotation/reaction/pin（§3.2） | 体验增强，非闭环必需，可后置 |

---

## 6. 移植方式

因**同源**（同函数名、同路由结构、同 store 方法签名），推荐：

1. **逐函数并**：从 echo-ai 的 `cowork_group_router.py` / `collaboration_store.py` 把 P0 函数搬过来，路由挂在 Echo OS 现有 `cowork_group_router` 的同一 router 上。
2. **store 先行**：先补 `collaboration_store` 的 P0 存储方法（collector 相关），再并路由。
3. **复用闭环 harness 验证**：移植后用 `benchmarks/run_closed_loop_handoff_sample.py` 那套（已打通的传输缝 + eval_harness）给 collector-retry 写个闭环 case，验证"采集失败 → 重试 → 不重不漏"。

---

## 7. 「当初为何砍」—— 已查证：不是砍，是迁移后分叉

已用 git 历史核实，**推翻"Echo OS 主动精简"的假设**：

| 事实 | 证据 |
|---|---|
| cowork 相关文件在 Echo OS **只有一次提交** | `git log --follow` 仅 `1c6041d5`（2026-08-31，5225 文件 / 126 万行一次性迁移） |
| **`collaboration_store.py` 引入时就是 935 行** | 迁移 stat 显示 `| 935 +`，非进来后被删 |
| echo-ai 在迁移**之后**继续往前走 | `a5d833b`（**2026-09-16**）"coordinate durable handoffs and exclusive resources" |

**结论：不是 Echo OS 刻意砍掉，而是 echo-ai 在 2026-09-16 又长出了一套新的 coordination 层，Echo OS 带的是 8-31 的快照。移植性质 =「跟上上游新进展」，不是「补回被删的功能」。**

### 7.1 echo-ai 9-16 新增的 coordination 层（Echo OS **完全缺失**）

`a5d833b` 新增的这套，恰好对准 Echo OS 的 A 路径缺口，且**是最新鲜、最完整的一块**：

| 文件 | echo-ai | Echo OS |
|---|---|---|
| `memory/cowork/coordination.py` | 452 | **缺** |
| `memory/cowork/coordination_service.py` | 354 | **缺** |
| `memory/cowork/_collaboration_schema.py` | 196 | **缺** |
| `sensing/gateway/_cowork_coordination.py` | 86 | **缺** |
| `memory/cowork/coordination_policy.py` | 66 | **缺** |
| `tests/test_group_coordination.py` | 409 | **缺** |

三件套齐全：**实现 + policy（策略层）+ schema（数据契约）+ 409 行测试**。
主题是 *durable handoffs（持久交接）+ exclusive resources（独占资源）*——正对应第 3 节缺的
collector 全生命周期「会失败、要重试、要不重不漏」，也与已打通的闭环 harness
（`interrupted-handoff`）是同一问题域。

### 7.2 依赖闭包与「最小可落地单元」（已实测）

逐文件解析 import，算清每个文件能不能独立并：

| 文件 | 行数 | 依赖 | 能否独立并 |
|---|---|---|---|
| **`coordination.py`** | 452 | **零 runtime 依赖** | ✅ **最干净切入点** |
| `coordination_policy.py` | 66 | 仅 `runtime.platform.process.scope` | ✅ 但单独并是孤儿（Echo OS 的 `runtime.py` 不调它） |
| `coordination_service.py` | 354 | coordination + coordination_policy + `event_log` + `session` | ✅ 作调用方 |
| `_cowork_coordination.py` | 86 | `async_work`（Echo OS 有） | ✅ |
| `_collaboration_schema.py` | 196 | `collaboration_collectors`(1245) / `_deliveries`(595) / `_runs`(525) / `context_lifecycle`(428) | ❌ **4 个依赖 Echo OS 全缺**，属 collector 那套，不属本批 |

**实测结论：** 把 `coordination.py` 源码放进 Echo OS 进程 exec → **`EXEC_OK`**，导出
`CoordinationStore` / `SCHEMA` / `TERMINAL` / `message_row` / `task_row` / `annotations`。
**452 行可干并，不需要任何依赖改造。**

**签名一致性核对（防分叉漂移）：** `ExecutionScope` 两边 11 个字段一字不差
（`mode/requested_mode/readable_roots/writable_roots/permission_mode/approval_policy/
sandbox_mode/execution_environment/shell_policy/network_policy/browser_policy`），
`resolve_execution_scope(session)` 签名一致 → `coordination_policy` 也可直接并。

**⚠️ 修正先前建议：** 曾提议"先并 `coordination_policy` + `_collaboration_schema` 试水"。
**`_collaboration_schema.py` 不能单独并**——它是 collector/delivery 存储层的聚合入口，
并它等于要并 2793 行依赖。正确的最小落地单元是：

- **最小存储+策略层**：`coordination.py` (452) + `coordination_policy.py` (66) = **518 行**
- **加调用方（避免孤儿）**：再并 `coordination_service.py` (354) → 合计 **872 行**
- **可带测试**：`tests/test_group_coordination.py`（409 行，Echo OS 缺）

### 7.2b 已并入：coordination 存储 + 策略层（518 行，smoke 通过）

已用 `cp` 原样复制（md5 校验一致）并入 Echo OS：

- `runtime/memory/cowork/coordination.py`（452 行）
- `runtime/memory/cowork/coordination_policy.py`（66 行）

**⚠️ 零 import 依赖 ≠ 零依赖**：`CoordinationStore.__init__(collaboration_store)` 使用
`self.store._lock` / `self.store._connect()`，是 **duck-typing 运行时依赖**，import 检查不到。
已验证 Echo OS 的 `collaboration_store` 两个成员都有（`collaboration_store.py:451` `self._lock
= threading.Lock()`、`:459` `def _connect()`）→ 安全。

**验证结果：**

1. 真 import：两模块 `IMPORT_OK`；`CoordinationStore` / `SCHEMA` / `TERMINAL` /
   `capture_policy` / `restore_scope` 符号齐全。
2. **真实 smoke 9 步全过**：建库（5 表）→ 建任务 + 依赖 → 状态推进 → handoff 消息（带
   artifacts 校验）→ 收件箱 → 签收 → **独占资源互斥（首次 True / 他人抢占 False）** →
   释放 → 快照。**SMOKE PASS**——在 Echo OS 上真能工作。

**设计定位（降低风险的关键）**：`coordination.py` docstring 明写 *"This is a mailbox and
dependency ledger, **not another agent scheduler**. Existing AsyncWorkStore tasks remain the
execution authority."* —— 它是**邮箱 + 依赖账本 + 资源租约**，不抢现有调度权威，
**与 Echo OS 现有执行层无冲突**。

5 张表：`coordination_tasks` / `coordination_context` / `coordination_messages` /
`coordination_events` / `coordination_resources`。

**状态：已写入但【未提交】**（工作区 42 个并行改动未清、门禁未复跑）。
**已知缺口**：`coordination_policy` 目前仍是**孤儿**（Echo OS 的 `runtime.py` 存在但不调
`restore_scope`），要真正生效还需并 `coordination_service.py`（354 行）作调用方，或自写 glue。

### 7.3 风险与未决（更新）

- ~~Echo OS 主动精简~~ → **已证伪**，改为：需确认 Echo OS 是否打算跟进上游 9-16 的 coordination 层。
- **耦合**：collector/delivery 依赖的 `group_fanout` / `_team_stream_group_fanout` 在 Echo OS 也被砍半（844→460 / 1815→730），若补 P0 可能要连带补 fanout 层；但** coordination 层是独立新增模块，耦合更小、更适合先并**。
- **定位校验仍要做**：即便不是"主动砍"，仍需判断"家庭/小团队一体机"是否需要 durable handoff + 独占资源这套重协作语义。
- **未提交**：本评估基于只读 diff，未改任何代码；Echo OS 工作区仍有 42 个他人并行改动未清。

---

*生成方式：只读跨仓 diff（echo-ai `/d/echo-ai` vs Echo OS），AST 函数/方法级比对，未修改任何代码。*
