param([string]$Python = "python")
$ErrorActionPreference = "Stop"
$backend = Split-Path -Parent $PSScriptRoot
$state = Join-Path $backend ("bin/test-run-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $state -Force | Out-Null
$env:AX_STATE_PATH = Join-Path $state "state.json"
$env:AX_KEY_DIR = Join-Path $state "keys"
$env:AX_ADMIN_LOGIN = "test-admin"
$env:AX_ADMIN_PASSWORD = "test-only-password-1234"
try {
    dotnet build (Join-Path $backend "AxBackend.csproj") --no-restore -o (Join-Path $state "build")
    if ($LASTEXITCODE -ne 0) { throw "백엔드 빌드 실패" }
    $server = Start-Process -FilePath "dotnet" -ArgumentList @((Join-Path $state "build/AxBackend.dll"), "--urls", "http://127.0.0.1:5199") -WorkingDirectory $backend -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 3
    & $Python (Join-Path $PSScriptRoot "integration.py")
    if ($LASTEXITCODE -ne 0) { throw "통합 검증 실패" }
    Stop-Process -Id $server.Id
    $server = Start-Process -FilePath "dotnet" -ArgumentList @((Join-Path $state "build/AxBackend.dll"), "--urls", "http://127.0.0.1:5199") -WorkingDirectory $backend -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 3
    & $Python (Join-Path $PSScriptRoot "persistence.py")
    if ($LASTEXITCODE -ne 0) { throw "재시작 검증 실패" }
} finally {
    if ($server) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
    Remove-Item Env:AX_STATE_PATH,Env:AX_KEY_DIR,Env:AX_ADMIN_LOGIN,Env:AX_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
