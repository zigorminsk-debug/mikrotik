# Disposable Windows CI only. Never use these heuristic OCR checks to assert
# authenticity or confidentiality of screenshots on a user's machine.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.FileAccessMode,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrResult,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
$script:asTask=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
if(!$script:asTask){throw 'WinRT AsTask missing'}
function Await-Ci([object]$op,[type]$type){
 $task=$script:asTask.MakeGenericMethod($type).Invoke($null,@($op));if(!$task.Wait(20000)){throw 'WinRT timeout'};return $task.Result
}
function Read-CiOcr([string]$image,[string]$mode='bicubic'){
 # Enlarge the lossless fixture image. Caller converts coordinates back by 3.
 $source=[System.Drawing.Image]::FromFile($image)
 $scaled=[System.Drawing.Bitmap]::new($source.Width*3,$source.Height*3);$graphics=[System.Drawing.Graphics]::FromImage($scaled)
 $tmp=Join-Path $env:RUNNER_TEMP 'winbox-ocr-scaled.png'
 try{
  if($mode -notin @('bicubic','nearest','threshold')){throw 'Unsupported OCR processing mode'}
  $graphics.InterpolationMode=if($mode -eq 'bicubic'){[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic}else{[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor}
  if($mode -eq 'threshold'){
   $attrs=[System.Drawing.Imaging.ImageAttributes]::new();try{$attrs.SetThreshold(0.6);$graphics.DrawImage($source,[System.Drawing.Rectangle]::new(0,0,$scaled.Width,$scaled.Height),0,0,$source.Width,$source.Height,[System.Drawing.GraphicsUnit]::Pixel,$attrs)}finally{$attrs.Dispose()}
  }else{$graphics.DrawImage($source,0,0,$scaled.Width,$scaled.Height)}
  $scaled.Save($tmp,[System.Drawing.Imaging.ImageFormat]::Png)
 }finally{$graphics.Dispose();$scaled.Dispose();$source.Dispose()}
 $file=Await-Ci ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
 $stream=Await-Ci ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
 try{
  $decoder=Await-Ci ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap=Await-Ci ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  try{$ocr=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages();if(!$ocr){throw 'No Windows OCR language installed'};return Await-Ci ($ocr.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])}finally{$bitmap.Dispose()}
 }finally{$stream.Dispose();Remove-Item $tmp -Force -ErrorAction SilentlyContinue}
}
function Find-CiAddressRows([object]$result,[string]$address,[string]$iface){
 foreach($line in $result.Lines){
  if($line.Text.Contains($address) -and $line.Text.Contains($iface)){
   foreach($word in $line.Words){if($word.Text -eq $address){$word.BoundingRect}}
  }
 }
}

# Research on the disposable fixture only. OCR often groups separated table
# columns into different lines. Anchor on the exact address word, then OCR a
# narrow strip at its vertical position to find the exact interface. Never
# infer an interface from an adjacent row, fuzzy-match a token, or choose a
# duplicate address. The caller must still validate the resulting detail view.
function Read-CiOcrAddressStrip([string]$image,[object]$wordRect,[string]$mode='bicubic'){
 $source=[System.Drawing.Bitmap]::FromFile($image)
 $strip=$null;$graphics=$null
 $tmp=Join-Path $env:RUNNER_TEMP 'winbox-ocr-row.png'
 try {
  # wordRect is in the enlarged image (scale 3). Avoid including neighbouring
  # 21px table rows; the extra padding is deliberately no more than 2 pixels.
  $left=[int][Math]::Floor(($wordRect.X+$wordRect.Width)/3)
  $top=[int][Math]::Max(0,[Math]::Floor($wordRect.Y/3)-2)
  $bottom=[int][Math]::Min($source.Height,[Math]::Ceiling(($wordRect.Y+$wordRect.Height)/3)+2)
  if($left -lt 0 -or $left -ge $source.Width -or $bottom -le $top -or ($bottom-$top) -gt 20){throw 'Invalid OCR row bounds'}
  $strip=[System.Drawing.Bitmap]::new($source.Width-$left,$bottom-$top)
  $graphics=[System.Drawing.Graphics]::FromImage($strip)
  $graphics.DrawImage($source,[System.Drawing.Rectangle]::new(0,0,$strip.Width,$strip.Height),[System.Drawing.Rectangle]::new($left,$top,$strip.Width,$strip.Height),[System.Drawing.GraphicsUnit]::Pixel)
  $strip.Save($tmp,[System.Drawing.Imaging.ImageFormat]::Png)
 } finally {if($graphics){$graphics.Dispose()};if($strip){$strip.Dispose()};$source.Dispose()}
 try{return Read-CiOcr $tmp $mode}finally{Remove-Item $tmp -Force -ErrorAction SilentlyContinue}
}
function Find-CiAddressRowsByStrip([object]$result,[string]$address,[string]$iface,[scriptblock]$readStrip){
 $candidates=@($result.Lines | ForEach-Object { $_.Words } | Where-Object { $_.Text -ceq $address })
 if($candidates.Count -ne 1){return}
 $candidate=$candidates[0]
 $stripResult=& $readStrip $candidate.BoundingRect
 $matches=@($stripResult.Lines | ForEach-Object { $_.Words } | Where-Object { $_.Text -ceq $iface })
 if($matches.Count -eq 1){return $candidate.BoundingRect}
}

# CI-only second experiment: an address is usable as an anchor only if its exact
# token occurs once. This alone must never be treated as verified settings.
function Find-CiUniqueAddress([object]$result,[string]$address){
 $words=@($result.Lines | ForEach-Object { $_.Words } | Where-Object { $_.Text -ceq $address })
 if($words.Count -eq 1){return $words[0].BoundingRect}
}
# Require exact label/value pairs on the same baseline, with the value to the
# right. This is a heuristic for one disposable CI fixture, not an authenticity
# proof or a production selector. Coordinates are in the scaled OCR image.
function Test-CiDetailField([object]$result,[string]$label,[string]$value){
 $words=@($result.Lines | ForEach-Object { $_.Words })
 $labels=@($words | Where-Object { $_.Text -ceq $label })
 $values=@($words | Where-Object { $_.Text -ceq $value })
 if($labels.Count -ne 1 -or $values.Count -ne 1){return $false}
 $a=$labels[0].BoundingRect;$b=$values[0].BoundingRect
 $cy1=$a.Y+$a.Height/2;$cy2=$b.Y+$b.Height/2
 return ($b.X -gt ($a.X+$a.Width)) -and ([Math]::Abs($cy1-$cy2) -le 18)
}
