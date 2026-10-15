# 项目概述 · Project Overview

> 自动从仓库结构提取。Echo · The Open-Source Multi-Agent AI Workspace.

Echo OS 是 Echo 家族的**私人云常驻执行环境**，部署在用户自己的服务器、NAS 或私有虚拟机上。Agent 运行时、浏览器桌面、启动器、文件与系统能力作为统一发行单元交付；OS 工作台用于私人云的管理与执行。

## 仓库结构

| Directory | Purpose |
| --- | --- |
| `runtime/` | Python runtime (agents / planner / executor / safety / memory) |
| `frontend/` | React + Vite SPA for the webui |
| `agents/` | Per-agent profile + memory + workspace directories |
| `docs/` | Human-written architecture docs, ADRs, invariants |
| `docs/auto/` | ← you are here · auto-generated |
| `tests/` | Pytest suite (backend) |
| `scripts/` | Tooling (this generator + OpenAPI snapshot) |
| `protocols/` | 8 protocol specs (digestion / immunity / swarm / …) |

## 规模

- Python 模块：**1564** 个（runtime/）
- TSX 组件：**905** 个（frontend/src）
- 后端测试：**1294** 个

