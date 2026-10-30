# CI only: construct self-contained Windows runtime and corresponding sources.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $root 'vendor'
$temp = Join-Path $env:RUNNER_TEMP 'mikrotik-qemu-package'
New-Item -ItemType Directory -Force -Path $vendor, $temp | Out-Null
$base = 'https://github.com/dextoros/qemu-runtime/releases/download/qemu-11.1.0-20260811'
function Get-Checked([string] $name, [string] $sha256, [string] $dest) {
  Write-Host "Downloading $name"
  Invoke-WebRequest -Uri "$base/$name" -OutFile $dest
  $actual = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $sha256) { throw "SHA-256 mismatch: $name" }
}
$setup = Join-Path $temp 'setup.exe'
Get-Checked 'qemu-w64-setup-20260811.exe' 'f98a8aeb5f7faea9765b6dee28316c266cd179d80354a2fed8e50176f9a2e59f' $setup
$unpacked = Join-Path $temp 'unpacked'
7z x -y "-o$unpacked" $setup | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'QEMU extraction failed' }
$exe = @(Get-ChildItem -Path $unpacked -Recurse -File -Filter 'qemu-system-x86_64.exe')
if ($exe.Count -ne 1) { throw 'Expected exactly one QEMU binary' }
$qemu = Join-Path $vendor 'qemu'
New-Item -ItemType Directory -Force -Path $qemu | Out-Null
Copy-Item -Path (Join-Path $exe[0].DirectoryName '*') -Destination $qemu -Recurse -Force
& (Join-Path $qemu 'qemu-system-x86_64.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'Bundled QEMU failed to start' }
$sources = Join-Path $vendor 'qemu-sources'
New-Item -ItemType Directory -Force -Path $sources | Out-Null
Get-Checked 'qemu-weilnetz-e470268ff446.tar.xz' '39a41d6063560bc7ae281f68b57b548b170ee1ce85558060606204dda950a368' (Join-Path $sources 'qemu-weilnetz-e470268ff446.tar.xz')
Get-Checked 'qemu-11.1.0.tar.xz' '6ee1d1a61f68212476b27108c26da5f449dc09b626d42f8279ba0dc2e08fa858' (Join-Path $sources 'qemu-11.1.0.tar.xz')
Get-Checked 'qemu-11.1.0.tar.xz.sig' 'fba624880262f196e4b4e38acf6bd28e47ba8fc2b0522e279a687565d11aae1f' (Join-Path $sources 'qemu-11.1.0.tar.xz.sig')
Get-Checked 'msys2-sources-20260811.tar' '0de6f997a021a3bbdff44cbfa3105cb4119a71564166c56836363138385483e9' (Join-Path $sources 'msys2-sources-20260811.tar')
Copy-Item -Path (Join-Path $root 'third-party/qemu/*') -Destination $sources -Recurse -Force
cl /nologo /O2 /W3 (Join-Path $root '../tools/windows/chr-supervisor.c') "/Fo$temp/chr-supervisor.obj" /link "/OUT:$vendor/chr-supervisor.exe"
if ($LASTEXITCODE -ne 0) { throw 'CHR supervisor compilation failed' }
