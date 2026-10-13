# Echo OS

Echo OS 是 Echo 家族的**私人云常驻执行环境**，部署在用户自己的服务器、NAS 或私有虚拟机上。Agent 运行时、浏览器桌面、启动器、文件与系统能力作为统一发行单元交付；OS 工作台用于私人云的管理与执行。

English readers: [README.en.md](README.en.md)

## Echo 三端定位

| 产品 | 定位 | 使用与运行场景 |
| --- | --- | --- |
| [Echo AI](https://github.com/dengdenghua/echo-ai) | 桌面 AI 工作端 | 面向本机文件、代码、应用和工具的深入工作；交互体验参考 Codex 桌面端。 |
| [Echo Mobile](https://github.com/dengdenghua/echo-mobile) | 手机 AI 入口 | 面向随身对话、语音沟通、任务发起和结果查看；交互体验参考手机上的 GPT 对话。 |
| [Echo OS](https://github.com/dengdenghua/echo-os) | 私人云常驻执行环境 | 部署在用户自己的服务器、NAS 或私有虚拟机上，承载后台任务、浏览器与计算环境；运行形态参考 Dot 的云端电脑。 |

这是三端的产品定位与协作方向，不代表所有跨端功能已经实现。桌面端可以本机执行；手机端和桌面端也可以连接私人云执行任务。助手和白幽灵小队属于执行成员，执行节点属于运行环境，两者不绑定为一对一关系。三端协作围绕统一身份、项目、任务与执行节点展开，具体实现状态以各仓库文档为准。

`echo-agent` 保留为 OS 内建 Agent 能力与兼容命令；`echo-enterprise`、`echo-storage` 分别是相关的企业与数据服务。

## 当前结构

| 路径               | 作用                                                      |
| ------------------ | --------------------------------------------------------- |
| `appliance/`       | OS 设备层：应用注册器、认证、扩展管理、文件管理、技能管理 |
| `frontend/`        | 桌面 UI 壳                                                |
| `tests/appliance/` | appliance 层测试                                          |
| `deploy/`          | K8s / Docker 部署配置                                     |
| `docs/`            | 架构、入门和参考文档                                      |

## 与 echo-storage(File Agent)集成

Echo OS 不重复建设文档索引，而是通过窄 HTTP API 调用可选的
`echo-storage` 服务：

- **桌面入口**:Dock/启动器新增"文件管家",打开 OS 内建的 `/workspace/storage`。
- **文件管理器桥接**:NAS 文件管理器(`appliance/files/`)顶部新增"AI 问答"面板,
  可直接调用 storage 的 `/v1/search` 与 `/v1/answer`。
- **基础文件闭环**:文件管理器支持多文件选择/拖放上传、带进度下载、文件与目录
  复制、移动、建目录和回收站；上传先写临时文件再原子提交，重名默认拒绝覆盖。
- **自动启动**:设置 `ECHO_STORAGE_AUTOSTART=1`,OS 启动时会后台拉起
  `echo-storage serve`(默认 127.0.0.1:8767);未安装或启动失败只记录日志,
  不阻塞其余功能。
- **地址可配**:通过 `ECHO_STORAGE_URL` / `ECHO_STORAGE_HOST` /
  `ECHO_STORAGE_PORT` 覆盖默认地址;`/api/appliance/config` 会把地址暴露给前端。

## 快速开始

10 分钟上手路径（首启 → 登录 → 第一个任务 → 审批 → 结果）见
[docs/GOLDEN_PATH.md](docs/GOLDEN_PATH.md)。需要 [uv](https://docs.astral.sh/uv/) 0.11.25
和带 corepack 的 Node.js 20+；不要用 `pip` 或裸 `python`（Windows 上它是应用商店占位程序）：

```bash
git submodule update --init
uv sync --locked --extra dev --extra serve --extra tracing --extra web --extra local-auth
cd frontend
corepack pnpm install --frozen-lockfile
corepack pnpm dev:with-agent
```

源码开发不要求生成发布 bundle；缺少 `config.local.yaml` 时使用仓库的 `config.example.yaml`。
更多细节见[开发接入](docs/ECHO_AGENT_INTEGRATION.md#本地开发)。

Docker 与原生镜像属于单独的交付路径，见[NAS 部署说明](deploy/appliance/README.md)
和[镜像构建](packaging/image/README.md)。

本地 QA 快照和真机部署步骤见 [NAS 部署说明](deploy/appliance/README.md)。

本地质量检查（与 CI 相同的命令）：

```bash
uv run pytest tests/ -q --timeout=60 -p no:cacheprovider   # 完整 Python 套件；不带路径时只跑 tests/appliance
cd frontend
corepack pnpm format
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

`dev:with-agent` 会启动 `127.0.0.1:8000` 的 Agent 后端与 `3000` 的唯一 OS 前端；
工作台是 OS 内建页面。完整配置见
[Echo Agent 工作台接入](docs/ECHO_AGENT_INTEGRATION.md)。

文档入口与历史资料归属：[docs/README.md](docs/README.md)。

当前架构：[docs/CURRENT_ARCHITECTURE.md](docs/CURRENT_ARCHITECTURE.md)

OS 与内建 Agent 的依赖规则：[Echo OS ↔ Echo Agent 工程边界](docs/AGENT_OS_BOUNDARY.md)。

NAS 产品交付边界与下一阶段门槛：
[NAS_DELIVERY_STATUS.md](docs/NAS_DELIVERY_STATUS.md)。
