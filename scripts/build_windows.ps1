$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DesktopRoot = Join-Path $ProjectRoot "desktop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "需要 Node.js 22.12 或更高版本。" }
Push-Location $DesktopRoot
try {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "依赖安装失败。" }
  npm test
  if ($LASTEXITCODE -ne 0) { throw "测试失败。" }
  node ..\scripts\validate.mjs
  if ($LASTEXITCODE -ne 0) { throw "项目检查失败。" }
  npm run package:win
  if ($LASTEXITCODE -ne 0) { throw "Windows 打包失败。" }
  $ReleaseDir = Join-Path $DesktopRoot "release\CodexQuotaFloat-win32-x64"
  $PackageVersion = (Get-Content (Join-Path $DesktopRoot "package.json") -Raw | ConvertFrom-Json).version
  $ZipPath = Join-Path $DesktopRoot "release\CodexQuotaFloat-Windows-x64-v$PackageVersion.zip"
  Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $ReleaseDir).FullName -DestinationPath $ZipPath -Force
  Write-Host "Windows 程序已生成：$ZipPath"
} finally { Pop-Location }
