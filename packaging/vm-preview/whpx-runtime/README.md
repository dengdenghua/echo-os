# Echo OS WHPX 运行时修复资料

本目录只对应主用 `v1-feature-gated`：**官方 QEMU 11.1.3 源码 + 上游
2026-10-22 的 11 个补丁 + 按成功查询并启用的特性位处理 TSC deadline 的本地修复**。
另含原生 CPython 构建目录的适配。它是项目的私有兼容构建，**不是 QEMU 官方已发布的兼容版**。

## 来源与补丁

`source.lock.json` 记录官方源码下载地址和 SHA256、原始邮件出处/作者/Message-ID、
固定应用顺序、压缩前后哈希、构建参数及工具版本。

- `upstream-20261022.mbox.gz`：Patchew 提供的 11 封原始补丁邮件；cover letter 链接见锁文件。
- `patches/01` 至 `11`：从原始 mbox 解码的完整邮件正文，含原作者及 Signed-off-by。
  它们是实际应用的源码补丁；原始 diff 的空白、换行和签名没有重新排版。
- `patches/12`：仅适配原生 CPython 的 `pyvenv/Scripts` 布局，属于构建适配。
- `patches/13`：仅在 processor feature banks 成功查询、过滤后成功启用，并且使用
  native LAPIC 的 reset 路径时，按 `Bank1.TscDeadlineTmrSupport` 决定是否清 deadline。
  支持该特性时，写寄存器失败仍沿用原错误处理；未按 CPU 厂牌或 Windows 版本硬编码。

patch 和 mbox 均用 `mtime=0`、无文件名头的确定性 gzip 包装，避免 Git 或
trailing-whitespace/EOF hook 改写原始 diff。请只在构建目录解压，保持 Git 中的 gzip 原件。
例如用所选构建 Python 查看第二个补丁：

```powershell
& $BuildPython -c "import gzip,sys;sys.stdout.write(gzip.open(sys.argv[1],'rt',encoding='utf-8').read())" patches/02-upstream.patch.gz
```

## 已锁定的构建输入

- `toolchain-packages.lock.json`：98 个 MSYS2 UCRT64 开发包的精确文件名、版本和 SHA256。
- `source.lock.json`：该索引来源、GCC 16.2.0 Rev6、Ninja 1.13.2、pkgconf 3.0.10、
  Windows Hypervisor 头文件及关键工具文件的哈希。
- `python-build.lock.json`：实际使用的 Python 构建包版本。解释器为 CPython 3.12.14，
  Meson 为 1.12.1；本地 `qemu` Python 项目来自同一源码的 `python/`。
- `reference-runtime.lock.json`：已经构建的主用候选的 14 个 EXE/DLL 身份，包含
  SDL2-compat 动态加载的 SDL3.dll。这里仅保存哈希，SDK、EXE、DLL 和固件不进入 Git。

工具链及 Python 环境由调用方预先准备。锁定包可按锁文件列出的 MSYS2 仓库地址获取并校验；
此目录没有自动安装 SDK 或修改全局工具的安装器。

## 重建

`rebuild.py` 复用已经执行成功的源码展开、补丁应用、configure 和 Ninja 步骤，
将路径参数化。准备好上述工具链、Python 和官方源码压缩包后运行，例如：

```powershell
& $BuildPython rebuild.py `
  --work-dir C:/Build/echo-whpx-fresh `
  --python C:/Tools/qemu-build-python/Scripts/python.exe `
  --toolchain-root C:/Tools/qemu-ucrt64 `
  --source-archive C:/Cache/qemu-11.1.3.tar.xz `
  --bash 'C:/Program Files/Git/bin/bash.exe' `
  --jobs 2 `
  --package-cache C:/Cache/msys2
```

工作目录必须新建或为空，并处于 Git checkout 之外。脚本先校验源码、13 个补丁和关键工具文件；
若传入 `--package-cache`，还校验全部 98 个包，支持重复传参查找多个只读缓存。
随后仅在工作目录展开 regular source files、按顺序应用补丁，调用提供的工具链。
`roms/` 不参与本次重建，运行时使用另外保留的预编译固件及明确的 `-L` 数据目录。

构建目标为 `qemu-system-x86_64.exe` 和 `qemu-img.exe`，启用 WHPX、TCG、SDL、
slirp、pixman、zstd，最多使用两个编译任务。完整参数在锁文件中。产物位于
`<work-dir>/build/`，新构建的来源和哈希写入 `<work-dir>/build-receipt.json`。

此参数化包装脚本本次只做了 CLI `--help`、语法和静态资料完整性检查；没有再次完整重建或启动虚拟机。
原步骤的成功构建已有独立日志与来源记录。参考产物 SHA256 识别的是那一次实际构建，
绝对路径及 PE 链接时间戳变化可能使重建字节不同；新产物需要重新验收。
桌面、Agent、双核启动及声音的运行验收由虚拟机验收报告维护。
