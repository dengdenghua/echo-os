# 发布 ECHO OS

三种标签，各自只触发一个工作流（`tests/test_preview_release_workflow.py` 校验互不误触发）：

| 标签 | 工作流 | 产出 | 前置条件 |
|---|---|---|---|
| `vX.Y.Z-preview.N` | `preview-release.yml` | GitHub **Pre-release**（不标为 latest）：未签名的 Windows 安装包、Linux AppImage、wheel、sdist、`SHA256SUMS` | 同一提交上 `ci.yml` 与 `runtime-security-contract.yml` 成功；不需要任何 secret |
| `vX.Y.Z` | `release.yml` | 草稿 Release：已签名的 Windows / macOS / Linux 安装包；PyPI；GHCR 镜像（cosign 签名） | 同一提交上 ci、runtime-security-contract、build-win（**已签名**）、build-mac、build-linux、behavioral-evidence 全部成功；`make production-readiness` 要求 Echo ≥ Codex；签名证书、Apple 公证、插件签名变量、PyPI Trusted Publisher |
| `echo-appliance-vX.Y.Z` | `appliance-release.yml` | NAS appliance 多架构镜像（GHCR）、运维包、SBOM | 只用 `GITHUB_TOKEN` |

## 版本号

`X.Y.Z` 以 `pyproject.toml` 为准，`frontend/package.json` 必须相同，`CHANGELOG.md` 必须有
`## [X.Y.Z]` 小节（两个桌面发布工作流的说明都取自这里）。预览标签的 `X.Y.Z` 必须等于当前版本，
`N` 从 1 开始递增。预览版安装包的应用版本就是 `X.Y.Z`，不带 `-preview`。

## 发布预览版

1. 把分支合并到 `os-main`，等 push 触发的 `ci.yml` 和 `runtime-security-contract.yml` 在合并提交上成功。
2. 打标签并推送：

   ```bash
   git tag v0.3.0-preview.1 <os-main 上的 SHA>
   git push upstream v0.3.0-preview.1
   ```

3. `preview-release.yml` 依次：核对标签与版本、查同 SHA 的 CI 证据 → 以 `preview: true` 调用
   `build-win.yml`（未签名）和 `build-linux.yml`，同时构建 sdist 与 wheel 并 `twine check` →
   生成 `SHA256SUMS` → 直接发布 Pre-release。说明 = `.github/preview-release-notes.md` 的中英文提示 +
   CHANGELOG 小节。
4. 重跑同一个预览标签（例如安装包构建偶发失败）：

   ```bash
   gh workflow run preview-release.yml --ref v0.3.0-preview.1 -f tag=v0.3.0-preview.1
   # Linux AppImage 构建失败时，可只发 Windows：追加 -f include_linux=false
   ```

   Release 已经存在时 `gh release create` 会失败，先 `gh release delete v0.3.0-preview.1 --yes`
   （保留标签）。需要改代码时，在新提交上打 `v0.3.0-preview.2`。

说明：

- 预览构建不读取任何签名 secret。`build-win` 的 job 仍声明环境 `windows-code-signing`：如果给它配了
  required reviewers，预览构建也要批准；如果限制了可部署的标签，需要放行 `v*-preview.*`。
- `build-win` / `build-linux` 仍会照常生成 GitHub 构建来源证明（OIDC，无需 secret），可用
  `gh attestation verify <文件> --repo dengdenghua/echo-os` 核对。
- 未配置 `ECHO_PLUGIN_SIGNING_*` 变量时，预览版不含内置插件发布者公钥，Release 说明会注明。

## 用户拿到什么

- `Echo-Setup-X.Y.Z-<sha>.exe`（未签名，SmartScreen 会提示，说明里写了“更多信息 → 仍要运行”）、
  `Echo-Setup-Linux-X.Y.Z-<sha>.AppImage`、`echo_os-X.Y.Z-py3-none-any.whl`、`echo_os-X.Y.Z.tar.gz`、
  `SHA256SUMS`。
- 没有 PyPI 包、没有镜像、没有 macOS 安装包。
- 不附 `latest.yml` 等更新元数据，应用内更新不会推送预览版；预览版用户要手动安装之后的版本
  （预览版与同号正式版的应用版本相同，自动更新不会把 `X.Y.Z` 预览版升级到 `X.Y.Z` 正式版）。

## 发布正式版

1. 配置签名证书、Apple 公证、`ECHO_PLUGIN_SIGNING_*` 变量、PyPI Trusted Publisher 和
   behavioral-evidence 自托管 runner。
2. 在发布 SHA 上手动运行 `build-win.yml`（必须产出已签名包）、`build-mac.yml`、`build-linux.yml`、
   `behavioral-evidence.yml`，等它们和 push 触发的 CI 全部成功。
3. `git tag v0.3.0 <同一 SHA> && git push upstream v0.3.0`，检查 `release.yml` 生成的草稿后再发布。

## 与 `echo-appliance-v*` 的关系

`appliance-release.yml` 只认 `echo-appliance-v*` 标签，预览和正式标签都不会触发它，反之亦然。
它不需要 secret，可以和预览版用同一个提交（`git tag echo-appliance-v0.3.0 <SHA> && git push upstream
echo-appliance-v0.3.0`）。在正式版之前，它推送的镜像是唯一的 GHCR 产物，预览通道不推镜像。
