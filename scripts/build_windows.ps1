$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DesktopRoot = Join-Path $ProjectRoot "desktop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "未检测到 Node.js 22 或更高版本。"
}

Push-Location $DesktopRoot
try {
  npm ci
  npm test
  npm run package:win

  $ReleaseDir = Join-Path $DesktopRoot "release\CodexQuotaFloat-win32-x64"
  $ZipPath = Join-Path $DesktopRoot "release\CodexQuotaFloat-Windows-x64.zip"
  if (Test-Path $ZipPath) { Remove-Item $ZipPath }
  Compress-Archive -Path "$ReleaseDir\*" -DestinationPath $ZipPath
  Write-Host "Windows 程序已生成：$ZipPath"
} finally {
  Pop-Location
}

