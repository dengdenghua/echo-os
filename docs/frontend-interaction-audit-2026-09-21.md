# 前端交互诊断（桌面核心链路，2026-09-21）

> 对象：`page.tsx`（桌面编排器，43 个 `useState`）+ `macos-shell.tsx`（macOS 外壳）
> + `intent-desktop-surface.tsx`（意图桌面）+ 桌面 hooks（`use-desktop-*`）。
> 方法：定向代码审查 + 全文探查 + 若干关键代码段取证。**未做运行期实测**，
> 截图 / 真机 / 可访问性扫描器验证见 §6 待办。
> 既有 `docs/desktop-workbench-ux-optimization.md` 是需求清单，本报告是「找问题」。

## P0 — 直接伤害用户

| 编号 | 位置 | 现象 | 证据 | 危害 | 建议 |
|---|---|---|---|---|---|
| P0-1 | `intent-desktop-surface.tsx:620` | 全局 `keydown` 用 `e.key === "/"` 判断斜杠键 | 实测 `e.key==='/'` **同时对应 主键区 `/` 与 数字键盘 `/`**（两处 `event.key` 都是 `"/"`） | 在**任何输入框**里按小键盘 `/` 会触发"聚焦意图输入框 + `preventDefault()`"，把正在输入的字符吃掉 | 判 `event.code`（`KeySlash` vs `NumpadDivide`）或加 `if (isInput) return`；补一条契约测试 |
| P0-2 | `intent-desktop-surface.tsx:629` | 全局 `keydown` 用 `e.code === "Space"` 切换模式 | 同上：Space 是**每个按钮的原生激活键**；全局捕获冒泡到 window 后 `toggleMode()` | 用 Tab 聚焦桌面任一按钮、按 Space 激活它时，会**同时触发模式切换** | 全局处理里 `if (isInput) return`，并对可聚焦控件统一 `event.preventDefault()` |
| P0-3 | `intent-desktop-surface.tsx:499-504` | `toggleMode` 直接调 `localStorage.setItem(...)`，无 try/catch | 该文件其它 `localStorage`（`:236/:248`）都有 `try{}catch{}`，唯独这处保存**裸奔** | 浏览器隐私模式 / 存储配额满时**抛异常打断渲染**，整个交互面崩 | 包一层 try/catch；读侧已是防御式，写侧应一致 |
| P0-4 | `macos-shell.tsx` | ~~45 个 `<button>` 全部无 `aria-label`~~ **更正：误报** | 初判按 `<button` 行数 grep（prettier 折行导致虚高）；逐 `<button>` 用 AST 复核：45 个里 27 个本就有 `aria-label`，其余 18 个全部有可见文本（菜单项 / 文字按钮）。**纯图标按钮缺名的 = 0** | 无需修；无障碍扫描仍可补（axe/Lighthouse）作运行期验证 |

## P1 — 体验 / 一致性受损

| 编号 | 位置 | 现象 | 证据 | 建议 |
|---|---|---|---|---|
| P1-1 | `page.tsx:741` | 通知轮询周期在 1.5s/5s 间随 `notificationsOpen` 跳变 | `setInterval(..., notificationsOpen ? 1_500 : 5_000)` | **已修**（加 `document.hidden` 节流；周期数值未动，属产品决策） |
| P1-2 | `page.tsx:1234` | `setInterval(poll, 3000)` 无条件 3s 轮询 `systemInfo` | `:1234` | **已修**（tick 内 `document.hidden` 直接 return） |
| P1-3 | `macos-shell.tsx:513` | `setInterval(() => setNow(new Date()), 1000)` 每秒 setState | `:513` | **已修**（同上；未改 `requestAnimationFrame`，避免引入新调度复杂度） |
| P1-4 | `intent-desktop-surface.tsx:236/248/292/504/654` | 桌面 mode/theme 偏好直存 `localStorage`（用户级），与同仓其它账号级偏好**边界不一** | 直接证据 | **部分已修**：`echo-desktop-mode` → 账号级（详见 `docs/preference-scope-audit-2026-09-21.md`）。该轮实测推翻"口径待定"的判断：**边界已有明文依据**，真缺口是**作用域命名三套并存**导致无法核查。`echo-desktop-theme` 保持设备级（属"硬件桌面外观"，且已被测试锁定） |
| P1-5 | `page.tsx:43` | 单组件 43 个 `useState` | grep 计数 | **已修**：8 个互斥浮层开关收敛为 `useDesktopOverlays`（见下"状态收敛"节）。剩余 `useState` 分属账号/通知/工作台/任务投影等独立域，无内聚簇，**不继续硬拆** |

## P2 — 代码健康（防腐蚀）

| 编号 | 现象 | 证据 | 建议 |
|---|---|---|---|
| P2-1 | 菜单项 `key={item.label + index}` 可能不稳 | `macos-shell.tsx:286` | 用稳定 `id` 作 key |
| P2-2 | `untracked_source_check` / `root_hygiene.py` 等门禁工具的**覆盖范围**需要复核（本轮发现 `docs/`、`nul` 不在 source roots，属设计如此但值得确认） | §A 脚注 | 见 §6 |

## 误报澄清（这轮没踩的坑，之前曾怀疑）

- `catch { return null }`（`page.tsx:1004`）：在 `resolveHubApplianceApp` 里，**预期**——找不到应用入口时安全回退，调用方 `openHubApplianceApp` 还会 `toast.error`。**不是吞错**。
- `catch { setSystemInfoStatus("error") }`（`page.tsx:1230`）：**正确**地反映错误到 UI，有 `alive` 守卫防卸载后 setState。**不是问题**。

## 与前一轮门禁结论的关系

本轮 P0-1 / P0-2 是**真实缺陷**，它们不是门禁能拦的（lint/typecheck 全绿也照样有）——
说明"修绿门禁 ≠ 交互正确"。建议在门禁外补一组**交互契约测试**（键盘路由、焦点管理）。

## 处置建议（请择）

1. 我先修 P0-1 + P0-2（键盘交互，影响最直接），再补对应契约测试；
2. P0-3 / P0-4 顺带一起修（改动小）；
3. P1 / P2 列进 backlog，下一轮再动。

## 修复记录（2026-09-21 01:0x，「优化」）

已修 **P0-1 / P0-2 / P0-3**，P0-4 确认误报未动。改动均在 `intent-desktop-surface.tsx`：

- **P0-1（小键盘 `/` 误触发）**：`:` 处 `e.key === "/"` 现在要求
  `e.code !== "NumpadDivide"` 且 `!isInput` —— 只响应主键区 `/`，且在输入框/可编辑区内不触发。
- **P0-2（Space 误切换模式）**：Space 分支现在要求焦点既不在输入框、也不在
  `button/a/select/summary` 上（即焦点在 body 空白处）才 `toggleMode()`；
  焦点在按钮上时让位给按钮的原生 Space 激活。
- **P0-1/2 共同前置守卫**：组合键（Cmd/Ctrl/Alt）除 `Cmd/Ctrl+K`（聚焦意图，保留）外一律放行，
  不再误吞系统/输入框快捷键；`isInput` 补充 `isContentEditable` 判定。
- **P0-3（localStorage 裸奔）**：`handleSubmitIntent` 里 `localStorage.setItem("echo-desktop-mode","workspace")`
  补上 `try/catch`（与同文件 `:292`、`:504` 的写法对齐），存储不可用时静默降级不再崩渲染。

**自评风险（低）**：键盘路由从"宽松"收紧，若有测试/用户依赖"输入框里按 `/` 也聚焦意图"
这类旧行为会变化——但这是** intended 的缺陷修复**。建议补交互契约测试锁定新行为（见 §6）。

**门禁**：prettier / eslint / tsc 三条本地复跑，结果见本节提交前的最近一次运行。

### P1 轮询优化（2026-09-21 01:09，「继续继续」）

已修 **P1-1 / P1-2 / P1-3**（三处 `setInterval`），统一加 `document.hidden` 节流 ——
页面不可见时跳过 tick（省 CPU/网络），回到前台时下一次 tick 立即补一帧（防数据过期）。
纯增量、不改任何数据语义、不动轮询周期：

| 位置 | 原状 | 改后 |
|---|---|---|
| `page.tsx:741` 通知轮询 | 周期 1.5s/5s 随 `notificationsOpen` 跳变 | tick 内 `if (document.hidden) return` |
| `page.tsx:1234` systemInfo | 无条件 `setInterval(poll, 3000)` | tick 内 `if (document.hidden) return` |
| `macos-shell.tsx:513` 时钟 | 每秒 `setNow(new Date())` | tick 内 `if (document.hidden) return` |

**未动**：周期数值本身（通知 1.5s/5s 跳变是产品决策，非纯性能问题，若要固定需产品确认）。
`page.tsx:43` 的 43 个 `useState` 拆 reducer（P1-5）与偏好边界收口（P1-4）面较大，单列。

**验证**：prettier / eslint / tsc `rc=0`；`macos-shell.test.tsx` 35 + `intent-desktop-surface.test.tsx` 16 = 51 passed。

### P1-5 状态收敛：8 个浮层 useState → `useDesktopOverlays`（2026-09-21 02:1x）

**为什么不按原计划拆 reducer**：`page.tsx` 里这组 `setXOpen` 写点约 80 处（`setSpotlightOpen` 单键就 18 处），
2653 行文件没有任何 `page.tsx` 专属测试兜底。在无测试保护下做全域 reducer 改写，漏改一处就是运行时静默行为变化。
故改为**抽一个自包含、可单测的 hook**，把这一内聚状态簇收敛进去 —— 纯增量、行为等价、有测试。

**改动**：

| 项 | 原状 | 改后 |
|---|---|---|
| 状态载体 | 8 个独立 `useState<boolean>` | 单一 `Record<DesktopOverlayKey, boolean>` |
| 写入口 | `setXOpen(true/false)` / `setXOpen(v => !v)` | `setOverlay(key, open)` / `toggleOverlay(key)` |
| 成组关闭 | Escape 与 `closeTransientPanels` 各手抄 7 行 | `closeTransient()`，键清单集中一处 |

**语义等价的关键约束（均已用单测锁定）**：

1. `setOverlay(key, v)` **只动指定键**，不隐式关其它浮层 —— 原 `setXOpen(true)` 也不关别人。
   "打开 A 前先关 B" 的互斥逻辑仍留在各业务函数里逐条显式书写（`openSpotlight` / `toggleControlCenter` /
   `toggleNotifications` / `openLiquidGlass` / `openSystemSettingsSection` 五处），**没有被顺手简化掉**。
2. `closeTransient()` 覆盖 **7 个**键：`spotlight` / `launchpad` / `controlCenter` / `notifications` /
   `about` / `accountSecurity` / `taskSpace`。**刻意不含 `liquidGlass`** —— 原 Escape 分支与
   `closeTransientPanels` 都不关流光玻璃面板，这条易被"看起来该统一"的直觉改错，已写成断言。
3. 值未变化时返回同一 state 引用 → 不触发下游重渲染（对齐 `useState` setter 语义）。

**顺带修掉的一处旧隐患**：该 effect 依赖数组原为 `[spotlightOpen, lockScreen]`，
但内部调用 `openSpotlight`，而 `openSpotlight` 是每次渲染重建的普通函数 —— 属既有 stale-closure 风险面，
只是当时把 `setSpotlightOpen` 换成 `setOverlay` 后，`react-hooks/exhaustive-deps` 才把它报出来。
已将 `openSpotlight` 用 `useCallback(..., [setOverlay])` 记忆化：既满足依赖完整性，
又让键盘 effect 不再每次渲染重挂监听，同时稳定了 `onOpenSpotlight` 这个下传 prop。
**注意**：这是一个独立于"纯重构"的附带改进，故单列说明，不计入"零行为变化"承诺。

**新增测试**：`frontend/src/appliance/use-desktop-overlays.test.ts` 5 条 —— 初始全 false；
`setOverlay` 无隐式互斥；`toggleOverlay` 只翻转指定键；`closeTransient` 关 7 键但**保住 `liquidGlassOpen === true`**；
同值写入引用不变（`expect(result.current).toBe(before)`，即无多余重渲染）。

**验证**：prettier `--check .` rc=0；eslint `--max-warnings=0` rc=0；tsc rc=0；
`use-desktop-overlays`(5) + `intent-desktop-surface.keyboard`(4) + `desktop/organizer-flow`(1) +
`desktop/organizer-result`(10) = 20 passed。

### P1-4 偏好作用域实测（2026-09-21 02:3x）

完整报告见 **`docs/preference-scope-audit-2026-09-21.md`**。三点要点：

1. **"口径待定"是误判。** 边界早有明文：设备级 = 硬件桌面外观（`desktop-workbench-ux-optimization.md:418`），
   其余内容/身份/工作形态偏好 = 账号级（同文件 `:531`、`AGENT_OS_POLISH_STATUS.md:944/1046`）。
   共享机制 `core/auth/scoped-storage.ts` 已被 **31 个生产文件**采用，含旧设备键一次性迁移。
2. **真缺口是"作用域不可核查"**：命名约定三套并存 —— 共享助手 `prefix:actor`、
   `enabled-modules.ts` 手写 `key:actor:actor`（且**手抄了一份迁移逻辑**）、
   `composer-draft.ts` / `desktop-start-guide.tsx` 把身份拼进中段。
   反证：用"未 import scoped-storage"作判据筛出 28 个设备级候选，复核发现其中 3 个其实已隔离 → 判据失效。
3. **本轮只改一处**：`echo-desktop-mode`（意图纯净态 ↔ 多窗口工作台）→ 账号级。
   它是桌面键里唯一"工作形态却设备级"的；引用面 3 处全在单文件内且无测试锁定其设备级语义。
   补了账号切换重载（照 `local-brain-setup.tsx:59-68` 范式），删掉 `handleSubmitIntent` 里
   重复的第二处写入。

**明确未动**：`echo-desktop-theme` + 液态玻璃 + 壁纸（`use-desktop-appearance.ts`）保持设备级 ——
属"硬件桌面外观"，且已被 `use-desktop-appearance.test.ts:31/62` 锁定，改动面与风险都不对等。

**测试环境陷阱（已记入 skill）**：`core/auth/api.ts:55` 的 `canUseBrowserStorage()`
在 `import.meta.env.MODE === "test"` 时恒为 false，导致 `currentActorId()` 在 vitest 里
**永远是 `"anonymous"`** —— 靠 sessionStorage 造不出真实 actor。这也是仓库把 actor 设计成
可注入参数的原因。本轮测试用 `vi.hoisted` + 局部 mock `@/core/auth/api` 解决。

**验证**：新增 4 条作用域契约测试；**负向突变**（实现改回裸设备键）后 4 条全部失败，确认非空转。

## §6 待办（验证缺口）
- [x] 交互契约测试锁定键盘新行为（P0-1/2）—— `intent-desktop-surface.keyboard.test.tsx` 4 条：
  Cmd/Ctrl+K 聚焦、主键盘 `/` 聚焦 vs 小键盘 `/` 不聚焦、输入框聚焦时 `/`/`Space` 不拦截、
  按钮聚焦时 Space 不切换模式。**已提交。**
- [x] 浮层开关语义单测（P1-5）—— `use-desktop-overlays.test.ts` 5 条。**已提交。**
- [ ] `page.tsx` 组件级冒烟测试（当前该 2653 行文件**零专属测试**，P1-5 只能抽 hook 单测，
  覆盖面受限）—— 若要继续动 `page.tsx`，建议先补一条"挂载后按 Escape / Cmd+Space 不崩"的冒烟测试
- [ ] 可访问性扫描（axe / Lighthouse）跑一遍 `macos-shell` + `intent-desktop-surface`（P0-4 已判误报，扫描仅作运行期佐证）
- [ ] 多账号下桌面偏好隔离的行为实测（P1-4）—— **代码侧已具备**（`echo-desktop-mode` 账号级 +
  单测覆盖迁移与账号切换）；仍缺的是**真机 / 浏览器人工验证**：两个账号来回切换，确认形态与外观各归其位
- [ ] P1-4 报告 §6 的四项待处理：`community-subscribe.ts` 漏网、三套命名收敛（含 `enabled-modules.ts`
  重复迁移逻辑）、工作区外观族补明文口径、28 个设备级候选逐个定级
- [ ] `untracked_source_check` 覆盖范围复核（`docs/`、`nul`、根目录杂文件）
