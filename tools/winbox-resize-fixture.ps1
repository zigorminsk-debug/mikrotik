# Disposable CI-only: reconstruct exactly the OCR resize from the saved crop.
# Not intended for user screenshots or private information.
param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Dest)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$crop=[System.Drawing.Bitmap]::FromFile($Source)
try {
 if($crop.Width -ne 380 -or $crop.Height -ne 180){throw 'Unexpected crop'}
 $large=[System.Drawing.Bitmap]::new($crop.Width*4,$crop.Height*4);$g=[System.Drawing.Graphics]::FromImage($large)
 try{$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$g.DrawImage($crop,0,0,$large.Width,$large.Height);$large.Save($Dest,[System.Drawing.Imaging.ImageFormat]::Png)}finally{$g.Dispose();$large.Dispose()}
}finally{$crop.Dispose()}
