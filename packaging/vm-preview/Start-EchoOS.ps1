param([ValidateRange(2048,8192)][int]$MemoryMiB = 4096, [ValidateSet('whpx','tcg')][string]$Accelerator = 'whpx', [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$kitRoot = $PSScriptRoot
$hostConfig = Get-Content -LiteralPath (Join-Path $kitRoot 'host.json') -Raw | ConvertFrom-Json
function Get-PreviewFileHash([string]$Path) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)
  try { return [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $algorithm.Dispose() }
}
$memory = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
$freeCommitMiB = [math]::Floor(($memory.CommitLimit - $memory.CommittedBytes) / 1MB)
$neededMiB = $MemoryMiB + 1024
if ($freeCommitMiB -lt $neededMiB) {
  throw "可分配内存不足：当前 $freeCommitMiB MB，启动需要至少 $neededMiB MB。请保存并关闭不用的大程序后重试。"
}
foreach ($file in @($hostConfig.qemu, $hostConfig.python, $hostConfig.firmware_code, (Join-Path $kitRoot 'private/seed.iso'), (Join-Path $kitRoot 'echo-os-preview.qcow2'))) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "缺少启动文件：$file" }
}
if ((Get-PreviewFileHash (Join-Path $kitRoot $hostConfig.base_image)) -ne $hostConfig.base_sha256) { throw 'Linux 基础镜像校验失败' }
if ((Get-PreviewFileHash (Join-Path $kitRoot 'payload/manifest.json')) -ne $hostConfig.payload_manifest_sha256) { throw '安装内容清单校验失败' }
if ($CheckOnly) { Write-Output '文件与内存检查通过；未启动虚拟机。'; exit 0 }
foreach ($port in @(18080,18082,18083,22422)) {
  if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "端口 $port 已占用，请先停止已有的预览实例。" }
}
$payloadRoot = Join-Path $kitRoot 'payload'
$serverScript = Join-Path $kitRoot 'payload-server.py'
$serverArgs = '"{0}" "{1}"' -f $serverScript,$payloadRoot
$server = Start-Process -FilePath $hostConfig.python -ArgumentList $serverArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $kitRoot 'logs/payload.out.log') -RedirectStandardError (Join-Path $kitRoot 'logs/payload.err.log')
try {
  $accelOptions = if ($Accelerator -eq 'whpx') { 'whpx,kernel-irqchip=off' } else { 'tcg,thread=single' }
  $qemuArgs = @('-name','Echo-OS-Development-Preview','-machine','q35','-accel',$accelOptions,'-cpu','max','-smp','2','-m',"$MemoryMiB",'-drive',"if=pflash,format=raw,readonly=on,file=$($hostConfig.firmware_code)",'-drive','if=pflash,format=raw,file=firmware/uefi-vars.fd','-drive','file=echo-os-preview.qcow2,if=virtio,format=qcow2','-drive','file=private/seed.iso,media=cdrom,readonly=on','-device','virtio-vga','-display','sdl,gl=off','-device','qemu-xhci','-device','usb-tablet','-netdev','user,id=net0,hostfwd=tcp:127.0.0.1:18080-:8000,hostfwd=tcp:127.0.0.1:22422-:22','-device','virtio-net-pci,netdev=net0','-qmp','tcp:127.0.0.1:18082,server=on,wait=off','-serial','file:logs/serial.log')
  Write-Output '正在启动 Echo OS 开发预览虚拟机。首次启动会联网安装桌面与组件，请保留此窗口。'
  Push-Location -LiteralPath $kitRoot
  try { & $hostConfig.qemu @qemuArgs; if ($LASTEXITCODE -ne 0) { throw "虚拟机退出，错误码 $LASTEXITCODE；请查看 logs。" } }
  finally { Pop-Location }
} finally {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
}
