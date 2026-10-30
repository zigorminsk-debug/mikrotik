# CI only: install the actual NSIS package into the temporary runner profile.
$ErrorActionPreference = 'Stop'
$installers = @(Get-ChildItem -Path 'dist' -File -Filter '*.exe')
if ($installers.Count -ne 1) { throw 'Expected exactly one installer' }
$target = Join-Path $env:RUNNER_TEMP 'mikrotik-install-test'
$run = Start-Process -FilePath $installers[0].FullName -ArgumentList @('/S', "/D=$target") -Wait -PassThru
if ($run.ExitCode -ne 0) { throw "Silent installation failed: $($run.ExitCode)" }
$paths = @('MikroTik Guide.exe','resources/app.asar','resources/chr-supervisor.exe',
  'resources/qemu/qemu-system-x86_64.exe', 'resources/qemu-sources/LICENSE',
  'resources/qemu-sources/COPYING.LIB', 'resources/qemu-sources/QEMU-LICENSE',
  'resources/qemu-sources/qemu-weilnetz-e470268ff446.tar.xz',
  'resources/qemu-sources/qemu-11.1.0.tar.xz', 'resources/qemu-sources/msys2-sources-20260811.tar')
foreach ($name in $paths) { if (!(Test-Path -LiteralPath (Join-Path $target $name) -PathType Leaf)) { throw "Missing installed component: $name" } }
$env:ELECTRON_ENABLE_LOGGING = '1'
$err = Join-Path $env:RUNNER_TEMP 'mikrotik-electron-stderr.log'
$out = Join-Path $env:RUNNER_TEMP 'mikrotik-electron-stdout.log'
$app = Start-Process -FilePath (Join-Path $target 'MikroTik Guide.exe') -PassThru -RedirectStandardError $err -RedirectStandardOutput $out
Start-Sleep -Seconds 10
$app.Refresh()
if ($app.HasExited) {
  $text = ((Get-Content -Raw $err -ErrorAction SilentlyContinue) -replace '%','%25' -replace "`r",'' -replace "`n",'%0A')
  Write-Output "::error title=Installed Electron diagnostics::$text"
  throw 'Installed application exited on startup'
}
Stop-Process -Id $app.Id -Force
Write-Host 'Installed application and bundled runtime/source files verified.'
