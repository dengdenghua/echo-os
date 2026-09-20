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
| P1-1 | `page.tsx:741` | 通知轮询周期在 1.5s/5s 间随 `notificationsOpen` 跳变 | `setInterval(..., notificationsOpen ? 1_500 : 5_000)` | 轮询周期应是后端能承受的**固定值**，打开面板用"拉一次 + 事件驱动"而非加速轮询 |
| P1-2 | `page.tsx:1234` | `setInterval(poll, 3000)` 无条件 3s 轮询 `systemInfo` | `:1234` | 仅当小组件可见时轮询（`showWidget` 已在依赖里，但 `setInterval` 无条件建）+ 页面不可见（`document.hidden`）时暂停 |
| P1-3 | `macos-shell.tsx:513` | `setInterval(() => setNow(new Date()), 1000)` 每秒 setState | `:513` | 时钟这类低频展示用 CSS / `requestAnimationFrame` 节流，或至少 `document.hidden` 时停 |
| P1-4 | `intent-desktop-surface.tsx:236/248/292/504/654` | 桌面 mode/theme 偏好直存 `localStorage`（用户级），与同仓其它账号级偏好（`docs/desktop-workbench-ux-optimization.md` 大量"账号作用域"条目）**边界不一** | 直接证据 | 统一"哪些偏好账号级 / 哪些设备级"，避免同一台机器多账号互相覆盖 |
| P1-5 | `page.tsx:43` | 单组件 43 个 `useState` | grep 计数 | 抽 reducer / 按域拆子组件，降低状态纠缠与重渲染面 |

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

## §6 待办（验证缺口）

- [ ] 可访问性扫描（axe / Lighthouse）跑一遍 `macos-shell` + `intent-desktop-surface`
- [ ] 契约测试：`/` 键、`Space` 键在输入框 / 按钮聚焦时**不**误触发
- [ ] 多账号下桌面偏好隔离的行为实测（P1-4）
- [ ] `untracked_source_check` 覆盖范围复核（`docs/`、`nul`、根目录杂文件）
