# GitHub-hosted Windows only: show, capture and cancel the genuine native dialog.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
$exe = Join-Path (Get-Location) 'windows/node_modules/electron/dist/electron.exe'
$script = Join-Path (Get-Location) 'tools/capture-chr-warning.js'
$out = Join-Path $env:RUNNER_TEMP 'chr-warning-output.log'
$err = Join-Path $env:RUNNER_TEMP 'chr-warning-error.log'
$p = Start-Process -FilePath $exe -ArgumentList @("`"$script`"") -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
try {
  $title = 'Доступ виртуальной CHR к сети'
  $cond = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $title)
  $dialog = $null
  for ($i=0; $i -lt 120; $i++) {
    $p.Refresh(); if ($p.HasExited) { throw 'Electron exited before the native dialog appeared' }
    $dialog = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$cond)
    if ($dialog) { break }
    Start-Sleep -Seconds 1
  }
  if (!$dialog) { throw 'Native warning not found through UI Automation' }
  $dialog.SetFocus(); Start-Sleep -Seconds 2
  $rect = $dialog.Current.BoundingRectangle
  if ($rect.Width -lt 200 -or $rect.Height -lt 100 -or $rect.Width -gt 3000 -or $rect.Height -gt 2000) { throw "Invalid screenshot dimensions: $($rect.Width)x$($rect.Height)" }
  $bitmap = [System.Drawing.Bitmap]::new([int]$rect.Width,[int]$rect.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen([int]$rect.X,[int]$rect.Y,0,0,$bitmap.Size)
    $bitmap.Save((Join-Path $env:RUNNER_TEMP 'chr-warning.jpg'),[System.Drawing.Imaging.ImageFormat]::Jpeg)
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
  $cancel = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'Отмена')
  $button = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$cancel)
  if (!$button) { throw 'Cancel button not found' }
  $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $pattern.Invoke()
  if (!$p.WaitForExit(30000)) { throw 'Electron did not exit after cancelling' }
  if ($p.ExitCode -ne 0) { throw "Electron failed: $(Get-Content -Raw $err -ErrorAction SilentlyContinue)" }
  if ((Get-Item (Join-Path $env:RUNNER_TEMP 'chr-warning.jpg')).Length -lt 5000) { throw 'Screenshot unexpectedly small' }
  Get-Content $out
} finally { $p.Refresh(); if (!$p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
