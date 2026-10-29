# Echo OS 开发预览虚拟机

此配置把 Debian 13、Echo OS 的 KWin/Xorg 桌面会话、Linux Electron 壳与内置 Agent
装进独立 QEMU 虚拟机，用于体验和手机联调。它不是 `packaging/image` 的正式整机镜像。
正式镜像的 A/B 更新与恢复、磁盘加密、TPM、Secure Boot、NAS 存储与特权操作验收均不包含在本预览中。

宿主为 Windows + QEMU；不依赖 Ubuntu/WSL。默认使用 WHPX 硬件虚拟化。
默认分配 4GB 内存、2 个虚拟处理器和 32GB 动态磁盘。首次启动需要网络安装 Debian 软件包及锁定的 Python 依赖。
没有 WHPX 的机器可显式选择 `Start-EchoOS.ps1 -Accelerator tcg`；软件虚拟化的完整桌面验收尚未完成。

## 准备与启动

准备脚本需要 Python 3.11+、PyYAML、pycdlib 1.14.0、Node、@electron/asar、OpenSSH 和 OpenSSL。
传入已验证的 Debian 官方 qcow2、Electron Linux zip、同源构建的前端 dist、统一 Python wheel、
`uv export --locked --no-dev --extra desktop-core --extra appliance --no-emit-project` 导出的依赖闭包及
只含 Electron 运行时依赖的 node_modules，以及 `extras/desktop/prepare-codex-linux.cjs` 生成并校验的
Linux Codex bundle（`--codex-bundle`）。所有源代码从当前 Git worktree 取出，清单记录 commit 和 dirty 状态。
准备操作只写新输出目录，不启动虚拟机，也不卸载 Ubuntu。

输出目录内双击“启动 Echo OS.cmd”。首次联网安装期间保留启动窗口，可在 `logs/serial.log` 查看进度，
虚拟机内完整安装日志为 `/var/log/echo-preview-install.log`。正常退出请使用桌面电源菜单或 `Stop-EchoOS.ps1`，
避免直接关闭 QEMU 窗口。`Start-EchoOS.ps1 -CheckOnly` 仅检查文件、校验和及可分配内存。

开发环境自动进入 `echo` 桌面。Linux 用户为 `echo`，应用管理员为 `admin`；随机口令保存在本机
`private/credentials.json`，SSH 临时联调密钥和初始化光盘也在该目录。此目录受本机 ACL 保护，不得随公共报告或安装包分享。
预览用户有免口令 sudo，供开发联调；不作为正式设备的账号策略。不要把完整套件公开发布。

本机浏览器入口为 `http://127.0.0.1:18080`，SSH 为 `127.0.0.1:22422`，均只监听宿主回环地址。
Agent 的屏幕捕获与输入运行在实际登录的 X11 用户会话中，支持远控授权、WebRTC 和 WSS 帧回退。
中文优先通过当前编辑框的辅助功能接口输入；Chromium、终端等应用使用稳定的 Unicode 键码批次，
结束后恢复键盘映射和输入法状态。两种方式均不替换剪贴板。Qt 的 Emoji 使用其 UTF-16 长度，锁屏时只向锁屏程序投递普通键盘事件，
不通过辅助功能编辑后台窗口。预览账号配置了拼音输入法，可用 Ctrl+空格切换。
真机跨网测试需要另行配置受保护的连接入口，默认套件没有开放宿主外网或局域网端口。

准备完成不代表启动、图形会话或远控验收通过。验收需实测启动、桌面和 Agent 健康、中文/Emoji、
授权撤销、断线恢复以及手机跨网连接。旧 Ubuntu 只有在替代环境验证成功并完成可恢复备份后才移除。
