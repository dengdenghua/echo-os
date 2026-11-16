# Echo OS 单 Agent 执行路径

2026-11-06，版本 `0.3.5-agent.preview.20261106`。本轮作用于 Echo OS 桌面和 Linux TV；没有覆盖独立演进中的 Echo AI，也没有生成 Android TV 包。

用户界面保留一个 Echo 助手。普通对话、桌面任务和 TV 任务统一进入 Codex App Server；模型、账号和提供方仍可以配置。旧客户端的引擎提示不会重新启用 OpenCode 或原生 ReAct。模型、登录、程序或角色权限未就绪时明确拒绝，不切换到其他执行引擎。

执行策略位于 `runtime/execution/agent_policy.py`。项目／团队分发仍由宿主管理，配置了 `ExecutionConfig` 的 OS 工作进程使用 Codex 执行成员任务。单独的历史库嵌入和历史记录兼容代码仍保留，不代表产品可切换引擎。默认关闭没有明确配置启用的后台辅助模型调用。

Codex 继续通过共享 HostToolBroker 使用知识库和系统工具，沿用工作区、身份、租约、审批、中断及只读约束。本次任务的模型设置通过宿主创建的对象传递，不允许客户端提交凭据或私有执行标记。模型选择不会获得新的权限。

TV 助手在发送前查询真实就绪状态，提供重新检查和模型设置入口。当前测试虚拟机没有配置模型；真实任务实测返回 `execution_unavailable / codex / model_incompatible`。Codex 0.149.0 在隔离空账号目录中通过 stdio 初始化和账号读取；这不等于真实模型推理验收。

验证：366 项后端测试通过，3 项 POSIX 权限测试在 Windows 上跳过；90 项前端测试通过；TypeScript、相关 ESLint、Ruff 和 Vite 构建通过。Linux 原生桌面验证了登录、大屏入口、就绪提示、模型设置入口、真实任务拒绝、授权视频播放。25 个安装文件通过 SHA-256 校验，包含实际导入的虚拟环境 site-packages；安装与回退在 Linux 隔离目录实际执行。

交付：`E:/AGENT/analysis/single-agent-20261106`。更新包专用于当前 Linux TV 预览基线及其 Python 3.13 环境，不是完整系统镜像。安装前停止桌面和 Agent，解包后运行 `sudo python3 install.py`；回退使用同一脚本 `--rollback`。脚本校验版本与所有文件摘要，保留 `/opt/echo-os/.single-agent-rollback`，不更改用户数据。

尚未放行生产：缺少真实模型回答与模型驱动工具调用验收；Android TV、语音、专用媒体工具、原生播放适配、公网和真机验收仍未完成。AI 后续同步需要按其现有路由接口适配，不能直接覆盖文件。

官方架构依据：[Codex App Server](https://learn.chatgpt.com/docs/app-server)、[Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform)。宿主管理产品状态、权限和工具，Codex 管理任务执行循环。

最终回退审查：团队执行失败后禁止自动进入原生 ReAct。旧群体拓扑仍含独立规划器，现明确返回 `topology_unavailable`；该功能待迁移，普通助手与成员协作保持同一 Codex 边界。

收尾：测试虚拟机与调试端口关闭。Windows 第一轮清理 1,549 个构建暂存文件（79,653,792 字节）；最终补包的暂存与被替代归档继续按 `retention-guard.json` 清理。完整包、独立 ASAR、必要证据及 VM 内一组回退保留。
