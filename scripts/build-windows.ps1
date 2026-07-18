$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Out = Join-Path $Root "artifacts\windows"
$BundleDir = Join-Path $Root "src-tauri\target\release\bundle\nsis"
Set-Location $Root

& (Join-Path $PSScriptRoot "setup-windows.ps1")
$Mise = (Get-Command mise).Source
& $Mise exec -- pnpm tauri build --bundles nsis

if (Test-Path $Out) {
  Remove-Item -Recurse -Force $Out
}
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$Installers = @(Get-ChildItem -Path $BundleDir -Filter "*.exe" -File)
if ($Installers.Count -eq 0) {
  throw "Expected Windows installer was not produced in $BundleDir"
}

$Installers | Copy-Item -Destination $Out
$Checksums = $Installers | ForEach-Object {
  $Hash = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLowerInvariant()
  "$Hash  $($_.Name)"
}
$Checksums | Set-Content -Encoding ascii (Join-Path $Out "SHA256SUMS.txt")

Write-Host "Windows installer: $Out"
