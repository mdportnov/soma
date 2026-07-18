$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $IsWindows -and $env:OS -ne "Windows_NT") {
  throw "setup:windows only supports Windows"
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw "WinGet is required: https://learn.microsoft.com/windows/package-manager/winget/"
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  & winget install --exact --id Git.Git --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -notin 0, 3010) {
    throw "Git installation failed with exit code $LASTEXITCODE"
  }
}

$VsWhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$HasBuildTools = $false
if (Test-Path $VsWhere) {
  $Installation = & $VsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  $HasBuildTools = -not [string]::IsNullOrWhiteSpace($Installation)
}

if (-not $HasBuildTools) {
  & winget install --exact --id Microsoft.VisualStudio.BuildTools --accept-package-agreements --accept-source-agreements --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  if ($LASTEXITCODE -notin 0, 3010) {
    throw "Visual Studio Build Tools installation failed with exit code $LASTEXITCODE"
  }
}

if (-not (Get-Command mise -ErrorAction SilentlyContinue)) {
  & winget install --exact --id jdx.mise --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -notin 0, 3010) {
    throw "mise installation failed with exit code $LASTEXITCODE"
  }
}

$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

$Mise = Get-Command mise -ErrorAction SilentlyContinue
if (-not $Mise) {
  throw "mise was installed but is not available yet. Restart PowerShell and run this command again."
}
$MisePath = $Mise.Source

& $MisePath trust (Join-Path $Root "mise.toml")
& $MisePath install -y
& $MisePath exec -- pnpm install --frozen-lockfile

Write-Host "Soma development environment is ready."
