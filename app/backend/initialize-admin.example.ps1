# 최초 관리자 계정이 없는 상태에서 프로젝트 루트의 PowerShell에서 실행합니다.
# 입력한 값은 이 스크립트나 Git에 저장하지 않습니다.
$env:AX_ADMIN_LOGIN = Read-Host '최초 관리자 아이디'
$env:AX_ADMIN_PASSWORD = Read-Host '최초 관리자 비밀번호 (12자 이상)' -MaskInput
try {
    dotnet run --project app/backend/AxBackend.csproj --urls http://127.0.0.1:5182
} finally {
    Remove-Item Env:AX_ADMIN_LOGIN, Env:AX_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}

