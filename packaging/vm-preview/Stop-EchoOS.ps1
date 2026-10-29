$ErrorActionPreference = 'Stop'
# ACPI power-button request only; never force-kill a VM or another application.
$client = New-Object System.Net.Sockets.TcpClient('127.0.0.1',18082)
try {
  $stream = $client.GetStream()
  $stream.ReadTimeout = 5000
  $reader = New-Object System.IO.StreamReader($stream)
  $writer = New-Object System.IO.StreamWriter($stream)
  $writer.AutoFlush = $true
  $null = $reader.ReadLine()
  $writer.WriteLine('{"execute":"qmp_capabilities"}')
  $null = $reader.ReadLine()
  $writer.WriteLine('{"execute":"system_powerdown"}')
  Write-Output '已请求虚拟机正常关机；如桌面显示关机确认，请在虚拟机中确认。'
} finally { $client.Dispose() }
