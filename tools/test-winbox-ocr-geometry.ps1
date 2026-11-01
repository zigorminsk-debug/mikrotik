# CI-only unit tests for the address anchor and exact interface matching.
$ErrorActionPreference='Stop'
try {
. (Join-Path $PSScriptRoot 'winbox-ocr-ci.ps1')
function Word([string]$text,[int]$y){[pscustomobject]@{Text=$text;BoundingRect=[pscustomobject]@{X=120;Y=$y;Width=90;Height=30}}}
function Result([object[]]$words){[pscustomobject]@{Lines=@([pscustomobject]@{Words=$words})}}
$one=Result @((Word '192.168.88.1/24' 90))
$reader={param($rect) Result @((Word 'bridge-lan' $rect.Y))}
if(@(Find-CiAddressRowsByStrip $one '192.168.88.1/24' 'bridge-lan' $reader).Count -ne 1){throw 'Exact row not found'}
if(@(Find-CiAddressRowsByStrip $one '192.168.88.99/24' 'bridge-lan' $reader).Count -ne 0){throw 'Wrong address matched'}
if(@(Find-CiAddressRowsByStrip $one '192.168.88.1/24' 'other' $reader).Count -ne 0){throw 'Wrong interface matched'}
$dup=Result @((Word '192.168.88.1/24' 90),(Word '192.168.88.1/24' 150))
if(@(Find-CiAddressRowsByStrip $dup '192.168.88.1/24' 'bridge-lan' $reader).Count -ne 0){throw 'Duplicate address accepted'}
$partial={param($rect) Result @((Word 'bridge' $rect.Y),(Word 'lan' $rect.Y))}
if(@(Find-CiAddressRowsByStrip $one '192.168.88.1/24' 'bridge-lan' $partial).Count -ne 0){throw 'Partial interface accepted'}
$duplicateInterface={param($rect) Result @((Word 'bridge-lan' $rect.Y),(Word 'bridge-lan' $rect.Y))}
if(@(Find-CiAddressRowsByStrip $one '192.168.88.1/24' 'bridge-lan' $duplicateInterface).Count -ne 0){throw 'Ambiguous interface accepted'}
Write-Output 'CI OCR selector: exact and negative synthetic tests passed.'

} catch {
 $known=@('Exact row not found','Wrong address matched','Wrong interface matched','Duplicate address accepted','Partial interface accepted','Ambiguous interface accepted')
 $message=if($known -contains $_.Exception.Message){$_.Exception.Message}else{'Unable to initialize or run synthetic fixture'}
 Write-Output ('::error title=CI OCR selector::'+$message)
 exit 1
}
