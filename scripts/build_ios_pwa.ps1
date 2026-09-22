$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PwaRoot = Join-Path $ProjectRoot "ios_pwa"

Push-Location $PwaRoot
try {
  npm ci
  npm run build
  Write-Host "iOS PWA 已生成：$PwaRoot\dist"
} finally {
  Pop-Location
}

