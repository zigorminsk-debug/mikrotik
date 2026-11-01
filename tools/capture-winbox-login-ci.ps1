# Disposable GitHub Windows runner. No user credentials or router connection.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$p=Start-Process -FilePath $env:WINBOX_EXE -PassThru
try {
 $handle=[IntPtr]::Zero
 for($i=0;$i -lt 45;$i++){$p.Refresh();if($p.HasExited){throw 'WinBox exited'};if($p.MainWindowHandle -ne [IntPtr]::Zero){$handle=$p.MainWindowHandle;break};Start-Sleep -Seconds 1}
 if($handle -eq [IntPtr]::Zero){throw 'No WinBox window'}
 Start-Sleep -Seconds 5
 $el=[System.Windows.Automation.AutomationElement]::FromHandle($handle);$rect=$el.Current.BoundingRectangle
 if($rect.Width -lt 400 -or $rect.Height -lt 300 -or $rect.Width -gt 3000 -or $rect.Height -gt 2000){throw 'Invalid window size'}
 $bitmap=[System.Drawing.Bitmap]::new([int]$rect.Width,[int]$rect.Height);$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
 $params=New-Object System.Drawing.Imaging.EncoderParameters(1);$params.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]40)
 try{$graphics.CopyFromScreen([int]$rect.X,[int]$rect.Y,0,0,$bitmap.Size);$codec=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|Where-Object{$_.MimeType -eq 'image/jpeg'}|Select-Object -First 1;$bitmap.Save((Join-Path $env:RUNNER_TEMP 'winbox-login-ci.jpg'),$codec,$params)}finally{$params.Dispose();$graphics.Dispose();$bitmap.Dispose()}
}finally{$p.Refresh();if(!$p.HasExited){Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue}}
