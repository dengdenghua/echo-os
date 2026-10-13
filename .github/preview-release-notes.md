> [!WARNING]
> **这是预览版，不是正式版。** 本版本用于尽早试用和反馈，没有经过正式版要求的行为评测；
> 正式版发布前，功能和数据格式都可能变化。
>
> **This is a preview build, not a stable release.** It is published for early testing and
> feedback and has not passed the behavioral evaluation that stable releases require. Features
> and data formats may change before the stable release.

### 安装前须知

- **安装包没有代码签名。** Windows 会弹出 SmartScreen 提示“Windows 已保护你的电脑”。请先用附件
  `SHA256SUMS` 核对文件（PowerShell：`Get-FileHash .\Echo-Setup-*.exe`），确认一致后点“更多信息” →
  “仍要运行”。Linux AppImage 先用 `sha256sum -c SHA256SUMS --ignore-missing` 核对，再
  `chmod +x` 后运行。
- **没有发布到 PyPI。** 需要 Python 包时，下载附件里的 `echo_os-*.whl`，用
  `uv tool install ./echo_os-<版本>-py3-none-any.whl` 安装。
- **不会自动更新。** 预览版不通过应用内更新推送；之后的预览版或正式版需要手动下载安装。
- **哪些功能需要模型。** 桌面、文件管理、存储、系统设置和设备连接不需要模型。让 Agent 干活的功能都
  需要先接入模型：桌面意图框里的任务、Agent 工作台与对话、AI 浏览器助手、Codex 引擎。在
  “系统设置 → 模型与 Codex”里登录 ChatGPT 账号、填写模型服务商的 API key，或部署本地模型。

### Before you install

- **The installers are not code-signed.** Windows SmartScreen will show "Windows protected your
  PC". Check the file against the attached `SHA256SUMS` first (PowerShell:
  `Get-FileHash .\Echo-Setup-*.exe`), then choose **More info → Run anyway**. On Linux, verify
  with `sha256sum -c SHA256SUMS --ignore-missing`, then `chmod +x` the AppImage and run it.
- **Not published to PyPI.** For the Python package, download the attached `echo_os-*.whl` and
  install it with `uv tool install ./echo_os-<version>-py3-none-any.whl`.
- **No automatic updates.** Previews are not offered through in-app updates; install later
  previews or the stable release manually.
- **Features that need a model.** The desktop, file manager, storage, system settings and device
  connections work without one. Everything that puts an agent to work needs a model first: tasks
  from the desktop intent box, the Agent workbench and chat, the AI browser assistant and the Codex
  engine. Connect one in **系统设置 → 模型与 Codex** (System Settings → Models & Codex): sign in
  with a ChatGPT account, enter a provider API key, or deploy a local model.
