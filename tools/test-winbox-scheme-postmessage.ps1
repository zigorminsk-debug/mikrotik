# Disposable Windows runner only. Test-only credentials never logged or saved.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CiMouse {
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int X,int Y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
 [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr hwnd,ref POINT pt);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd,uint msg,IntPtr wParam,IntPtr lParam);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd,IntPtr hdc,uint flags);
}
'@
# CI-only: read disposable credentials from stdin, never arguments or env.
# Input simulation is NOT safe for production (foreground focus can change).
$record=([Console]::In.ReadLine() | ConvertFrom-Json)
if(!$record -or $record.port -lt 1 -or $record.port -gt 65535 -or $record.password -notmatch '^Lab_[0-9a-f]{40}$'){exit 1}
$stage='start'
$p=$null
$errLog=Join-Path $env:RUNNER_TEMP 'winbox-ci.stderr'
$outLog=Join-Path $env:RUNNER_TEMP 'winbox-ci.stdout'
try {
$p = Start-Process -FilePath $env:CI_WINBOX_EXE -PassThru -RedirectStandardError $errLog -RedirectStandardOutput $outLog
 $stage='window'
 $handle=[IntPtr]::Zero
 for($i=0;$i -lt 90;$i++){ $p.Refresh();if($p.HasExited){throw 'WinBox exited'};if($p.MainWindowHandle -ne [IntPtr]::Zero){$handle=$p.MainWindowHandle;break};Start-Sleep -Seconds 1 }
 if($handle -eq [IntPtr]::Zero){throw 'WinBox window missing'}
 Start-Sleep -Seconds 5
 $element=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
 $rect=$element.Current.BoundingRectangle
 if($rect.Width -lt 1000 -or $rect.Height -lt 700 -or $rect.Width -gt 1100 -or $rect.Height -gt 800){throw 'Unexpected CI login size'}
 $stage='login-input'
 # CI research only. Post directly to our WinBox process window; do not use
 # global keyboard injection for the test password. Still coordinate-based.
 function PostClick([int]$x,[int]$y) {
  $pt=New-Object 'CiMouse+POINT';$pt.X=[int]$rect.X+$x;$pt.Y=[int]$rect.Y+$y
  if(![CiMouse]::ScreenToClient($handle,[ref]$pt)){throw 'Coordinate conversion failed'}
  $lp=[IntPtr](($pt.Y -shl 16) -bor ($pt.X -band 65535))
  if(![CiMouse]::PostMessage($handle,0x201,[IntPtr]1,$lp)){throw 'Mouse down failed'}
  if(![CiMouse]::PostMessage($handle,0x202,[IntPtr]0,$lp)){throw 'Mouse up failed'}
  Start-Sleep -Milliseconds 300
 }
 function PostText([string]$text) {
  foreach($c in $text.ToCharArray()) {if(![CiMouse]::PostMessage($handle,0x102,[IntPtr]([int]$c),[IntPtr]1)){throw 'Character input failed'}}
  Start-Sleep -Milliseconds 300
 }
 # Hold a harmless decoy window in the foreground while the target receives
 # the test credentials. This is still not a production security proof.
 $decoy=New-Object System.Windows.Forms.Form;$decoy.Text='CI foreground decoy';$decoy.Width=300;$decoy.Height=120
 $decoy.Show();$decoy.Activate();[System.Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 500
 [void][CiMouse]::SetForegroundWindow($decoy.Handle);Start-Sleep -Milliseconds 500
 if([CiMouse]::GetForegroundWindow() -ne $decoy.Handle){throw 'CI decoy not focused'}
 PostClick 230 318
 PostText ('127.0.0.1:'+ $record.port)
 PostClick 230 367
 PostText $record.password
 PostClick 198 471
 if([CiMouse]::GetForegroundWindow() -ne $decoy.Handle){throw 'Input changed the foreground window'}
 $decoy.Close();$decoy.Dispose()
 $record.password=$null
 $stage='workspace'
 Start-Sleep -Seconds 35
 $p.Refresh();if($p.HasExited){throw 'WinBox exited during login'}
 $element=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
 $rect=$element.Current.BoundingRectangle
 if($rect.Width -lt 700 -or $rect.Height -lt 500 -or $rect.Width -gt 3000 -or $rect.Height -gt 2000){throw 'Unexpected WinBox dimensions'}
 [void][CiMouse]::SetForegroundWindow($handle)
 # Fail closed: a genuine workspace must expose IP in the accessibility tree.
 $stage='ip-menu'
 $ipCondition=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'IP')
 $ip=$element.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$ipCondition)
 if(!$ip){
  # Qt accessibility may not expose WinBox menus. Only use coordinates if
  # the private, temporary WinBox log confirms authentication AND workspace.
  $privateLog=(Get-Content -Raw $errLog -ErrorAction SilentlyContinue)+(Get-Content -Raw $outLog -ErrorAction SilentlyContinue)
  if($privateLog -match 'Auth OK' -and $privateLog -match 'first clock synced') {$stage='verified-workspace-no-uia';$r=[System.Windows.Rect]::new($rect.X+45,$rect.Y+270,20,22)}
  else {$stage='authentication-unconfirmed';throw 'WinBox workspace not authenticated'}
 } else {$r=$ip.Current.BoundingRectangle}
 if($r.Width -le 0 -or $r.Height -le 0){throw 'WinBox IP control is not visible'}
 [void][CiMouse]::SetCursorPos([int]($r.X+$r.Width/2),[int]($r.Y+$r.Height/2));[CiMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[CiMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Seconds 3
 # Coordinates were visually checked on the disposable runner at 1024x768.
 # The image remains provisional until visually checked against the plan.
 $stage='addresses-menu'
 [void][CiMouse]::SetCursorPos([int]$rect.X+185,[int]$rect.Y+75);[CiMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[CiMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Seconds 5
 # The default Address column truncates IPs on this runner. Widen it so the
 # actual example values are readable, then require human visual inspection.
 [void][CiMouse]::SetCursorPos([int]$rect.X+515,[int]$rect.Y+204)
 [CiMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 [void][CiMouse]::SetCursorPos([int]$rect.X+650,[int]$rect.Y+204)
 Start-Sleep -Milliseconds 500
 [CiMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Seconds 3
 $stage='screenshot'
 $bitmap=[System.Drawing.Bitmap]::new([int]$rect.Width,[int]$rect.Height);$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
 $params=New-Object System.Drawing.Imaging.EncoderParameters(1);$params.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]40)
 try{
  $graphics.CopyFromScreen([int]$rect.X,[int]$rect.Y,0,0,$bitmap.Size)
  $jpeg=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {$_.MimeType -eq 'image/jpeg'} | Select-Object -First 1
  $bitmap.Save((Join-Path $env:RUNNER_TEMP 'lab-scheme-winbox.jpg'),$jpeg,$params)
 }finally{$params.Dispose();$graphics.Dispose();$bitmap.Dispose()}
 if($env:CI_CAPTURE_PRINT -eq '1'){
  $stage='print-window'
  $bitmap=[System.Drawing.Bitmap]::new([int]$rect.Width,[int]$rect.Height);$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
  $params=New-Object System.Drawing.Imaging.EncoderParameters(1);$params.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]40)
  try{
   $hdc=$graphics.GetHdc();try{$ok=[CiMouse]::PrintWindow($handle,$hdc,2)}finally{$graphics.ReleaseHdc($hdc)}
   if(!$ok){throw 'PrintWindow failed'}
   $bitmap.Save((Join-Path $env:RUNNER_TEMP 'lab-scheme-print.jpg'),$jpeg,$params)
  }finally{$params.Dispose();$graphics.Dispose();$bitmap.Dispose()}
 }
 if($env:CI_CAPTURE_DHCP -eq '1'){
  $stage='dhcp-client'
  [void][CiMouse]::SetCursorPos([int]$rect.X+55,[int]$rect.Y+280);[CiMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[CiMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  Start-Sleep -Seconds 3
  [void][CiMouse]::SetCursorPos([int]$rect.X+185,[int]$rect.Y+121);[CiMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[CiMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  Start-Sleep -Seconds 5
  $bitmap=[System.Drawing.Bitmap]::new([int]$rect.Width,[int]$rect.Height);$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
  $params=New-Object System.Drawing.Imaging.EncoderParameters(1);$params.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]40)
  try{$graphics.CopyFromScreen([int]$rect.X,[int]$rect.Y,0,0,$bitmap.Size);$bitmap.Save((Join-Path $env:RUNNER_TEMP 'lab-scheme-dhcp.jpg'),$jpeg,$params)}finally{$params.Dispose();$graphics.Dispose();$bitmap.Dispose()}
 }
}catch{Write-Output ('CI_STAGE='+$stage);exit 1}finally{if($p){$p.Refresh();if(!$p.HasExited){Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue}};Remove-Item $errLog,$outLog -Force -ErrorAction SilentlyContinue}
