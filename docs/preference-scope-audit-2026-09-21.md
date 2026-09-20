# 偏好作用域实测（P1-4）· 2026-09-21

> 承接 `docs/frontend-interaction-audit-2026-09-21.md` 的 P1-4。该条此前被记为"面较大、
> 需先定产品口径"，本轮的结论是：**口径早已存在且有明文依据，真正的缺口不在"哪些偏好该隔离"，
> 而在"隔离方式有三套并存，导致无法用统一判据核查"。**

## 1. 结论摘要

| # | 结论 | 证据强度 |
|---|---|---|
| A | 账号级作用域**有既定机制**：`core/auth/scoped-storage.ts`，含"旧设备键一次性迁移" | 直接证据（代码 + 单测） |
| B | 账号级 vs 设备级的**边界有明文口径**，不需要重新拍板 | 直接证据（两处文档） |
| C | 但命名约定**三套并存**，同一概念有三种键格式 | 直接证据（逐文件复核） |
| D | 迁移逻辑被**手抄了一份**（含注释都近似），已出现与助手不一致的风险 | 直接证据（逐行比对） |
| E | 用"是否 import scoped-storage"作判据会**误判 3 个已隔离的文件** | 反证：实证复核推翻了该判据 |
| F | `community-subscribe.ts` 是真漏网：**订阅状态设备级**，而同域点赞/收藏已账号级 | 直接证据 |
| G | 本轮修掉 `echo-desktop-mode`（唯一"工作形态却设备级"的桌面键） | 直接证据 + 负向突变验证 |

## 2. 机制：账号级作用域是怎么做的

`core/auth/scoped-storage.ts`（全文 32 行）导出两个东西：

```ts
// :4-10
export function actorScopedStorageKey(prefix, actor = currentActorId()): string {
  const normalized = actor.trim() || "anonymous";
  return `${prefix}:${encodeURIComponent(normalized)}`;   // 约定 ①：prefix:actor
}

// :13-31  读 scoped → miss 则读旧设备键 → 非 anonymous 才迁移并删除旧键
export function readActorScopedStorageValue(prefix, actor = currentActorId()): string | null
```

`currentActorId()`（`core/auth/api.ts:139`）从 `sessionStorage["echo_user"]` 取
`user_id`/`actor_id`/`id`/`username`/`phone` 首个非空串，否则 `"anonymous"`。

**已采用面（实证）**：31 个生产文件同时使用 `localStorage` 与 `scoped-storage`，覆盖
浏览器（会话/历史/书签/下载/扩展/Agent 权限与审计/研究日志）、工作台侧栏（项目分组、
折叠态、面板宽度）、`mode-selector`（聊天模式覆盖）、Design（画布视图/工作区布局/启用模型）、
Active Agent、助手昵称、积分账本、社区点赞收藏、市场横幅、onboarding、最近工作目录、
系统设置（`core/settings/local.ts`）、团队首选项、工作台偏好等。

## 3. 边界口径（无需重新决策）

仓库已把"设备级 = 硬件桌面外观"写死：

- `docs/desktop-workbench-ux-optimization.md:418`
  > 应用排序、Dock 顺序和**壁纸继续作为设备级桌面偏好，避免把硬件桌面外观与账号内容混在一起**。
- `docs/desktop-workbench-ux-optimization.md:531`（同文件后文，收紧了浏览器首页那一层）
  > 应用排列、Dock 和壁纸偏好与快捷链接、文件夹、组件一样**使用 actor 作用域**……
  > 避免共享设备账号互相覆盖。
- `docs/AGENT_OS_POLISH_STATUS.md:944` / `:1046` 复述了上述两次收口。

两条并不矛盾：418 谈的是 **OS 桌面**（硬件外观 → 设备级），531 谈的是
**内置浏览器首页**（个人内容布局 → 账号级）。代码与之一致 ——
`components/browser/browser-home.tsx:456` 起，首页全部布局键
（`desktop-backdrop` / `dock-app-urls` / `desktop-app-order` / `quick-links` / `folders` / `widgets`）
都经 `actorScopedStorageKey`。

## 4. 真正的缺口：三套命名 + 一处分叉

| 约定 | 键格式 | 位置 | 迁移逻辑 |
|---|---|---|---|
| ① 共享助手 | `prefix:actor` | `core/auth/scoped-storage.ts:4-10` | 有（`:13-31`） |
| ② 手写 | `key:actor:actor` | `core/modules/enabled-modules.ts:40-42` | **手抄一份**（`:45-59`） |
| ③ 手写（身份内嵌中段） | `prefix+actor:threadId` | `core/threads/composer-draft.ts:30-37` | 无 |
| ③′ 手写（身份变量拼接） | `echo:desktop-start.v2:${props.identity}` | `appliance/desktop-start-guide.tsx:51` | 无 |

②的重复实现值得单独看 —— 它和共享助手的语义**几乎逐行相同**，但**分隔符不同**：

```ts
// enabled-modules.ts:40 ，注意是 :actor: 而不是 :
function scopedStorageKey(key: string, actor = currentActorId()): string {
  return `${key}:actor:${encodeURIComponent(actor || "anonymous")}`;
}
```

**危害不是"命名不好看"，而是让作用域失去可核查性。** 反证：本轮先用
"用了 `localStorage` 但没 import `scoped-storage`"作判据做分类，得到 28 个"设备级候选"，
逐个复核后发现其中 **`enabled-modules.ts`、`composer-draft.ts`、`desktop-start-guide.tsx`
三个其实都已隔离**，只是走的是自造约定 —— 判据直接失效。

> 这也解释了为什么这条审计项会长期悬着：**看单个文件无法判断它有没有做隔离**，
> 必须理解三套约定才能读对。

## 5. 本轮改动：`echo-desktop-mode` → 账号级

### 为什么改它

`appliance/intent-desktop-surface.tsx` 的 `echo-desktop-mode`（`"pure"` = 意图纯净态 /
`"workspace"` = 多窗口工作台）是全仓桌面键里**唯一"工作形态却落在设备级"**的：

- 它描述"这个账号想怎么工作"，不是这台设备的硬件外观 → 按第 3 节口径属账号侧；
- 同类概念都已账号级：聊天模式覆盖 `echo:modeOverride`（`components/workspace/mode-selector.tsx:656`）、
  侧栏折叠态、面板宽度、Design 工作区布局；
- 引用面极小：全仓仅 3 处，全部在本文件内，**且无任何测试锁定其设备级语义**
  （对比 `echo-desktop-theme` 被 `use-desktop-appearance.test.ts:31/62` 直接断言为设备键 → 属
  已被测试锁定的既定决策，**本轮不动**）。

### 改了什么

- 新增 `readPersistedDesktopMode()` / `persistDesktopMode()`，分别走
  `readActorScopedStorageValue` 与 `actorScopedStorageKey`；
- 旧设备级键由既有迁移助手**一次性归属当前账号**，不写新逻辑；
- 补账号切换重载：`modeActor` state + effect，账号变化时重读，避免旧账号形态泄漏
  （照 `components/workspace/local-brain-setup.tsx:59-68` 的既有范式）；
- 顺手删掉 `handleSubmitIntent` 里**重复的第二处写入** —— 原代码在 `setMode("workspace")`
  之后又手动 `setItem` 同一个值，注释自称"与 setMode 内联的写入一致"，实为冗余。

### 新增测试（4 条，`intent-desktop-surface.test.tsx`）

1. 形态写入 `echo-desktop-mode:alice` 而非裸键；
2. 同设备双账号互不覆盖；
3. 旧设备键迁移到当前账号并删除旧键；
4. 账号切换重载，不沿用上一账号的形态。

**负向突变验证**：把实现突变成裸设备键后，上述 4 条**全部失败**（`4 failed`），
确认测试非空转；随后还原并 `diff -q` 校验字节一致。

### 过程中发现的一个测试环境陷阱（值得记住）

```ts
// core/auth/api.ts:55
function canUseBrowserStorage(): boolean {
  return typeof window !== "undefined" && import.meta.env.MODE !== "test";
}
```

**测试模式下恒为 false → `currentActorId()` 永远返回 `"anonymous"`**，因此
在 vitest 里靠 `sessionStorage.setItem("echo_user", ...)` **造不出真实 actor**。
这也是仓库里大量模块把 actor 设计成**可注入参数**（`actorScopedStorageKey(prefix, actor)`）
的原因 —— 便于测试传显式 actor。本轮测试改用对 `@/core/auth/api` 的**局部 mock**
（`vi.hoisted` 持有可变 actor，避免 `vi.mock` 工厂提升导致的 TDZ）。

## 6. 仍待处理（本轮未动）

| # | 项 | 建议 |
|---|---|---|
| 1 | `community-subscribe.ts`（`:25` `echo.community.subscribe-topics.v1`、`:60` `…subscribe-authors.v1`）设备级，而同域点赞/收藏/评论已账号级（`community-data.ts:30`） | **真漏网**，建议纳入账号级；需确认"主题/作者订阅"是否属个人内容 |
| 2 | 三套命名并存（§4） | 建议收敛到共享助手；最少先给 `enabled-modules.ts` 的手写迁移换成 `readActorScopedStorageValue`，删掉重复实现。**注意键格式变化需一次性兼容**（`key:actor:x` → `key:x`） |
| 3 | 工作区外观族 `echo-theme` / `echo-corner-scale` / `echo-density` / `echo-palette` / `echo-custom-color`（`hooks/use-appearance.ts:27-30`）为设备级，**但文档从未提及这一族** | 按第 3 节口径属"外观"侧、可保留设备级，但建议**补一句明文**，否则下一轮还会被当成漏网 |
| 4 | 28 个"未 import scoped-storage 的生产文件"清单（§4 判据副产品） | 逐个按语义定级；本轮已验证其中 3 个属误判、1 个真漏网，其余未评 |

## 7. 验证

- prettier `--check .` → `rc=0`；eslint `--max-warnings=0` → `rc=0`；`tsc --noEmit` → `rc=0`
- 定向：`intent-desktop-surface.test.tsx` 20 + `intent-desktop-surface.keyboard.test.tsx` 4 = **24 passed**
- 全量 vitest：**520 文件 / 3674 passed / 2 skipped / 0 failed**
