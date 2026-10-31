#!/bin/sh
set -eu

if [ "${AX_DEMO_MODE:-0}" != "1" ]; then
  exec dotnet AxBackend.dll
fi

# Demo inputs are configured at runtime, never baked into the image or Git.
# Both business state and cookie keys intentionally use ephemeral storage.
demo_root=$(mktemp -d /tmp/ax-demo.XXXXXX)
mkdir -p "$demo_root/app/backend" "$demo_root/엑셀 파일" "$demo_root/state"
ln -s /app/app/backend/wwwroot "$demo_root/app/backend/wwwroot"
printf '%s' "${AX_SPEC_XLSX:?Missing demo specification}" | base64 -d > "$demo_root/엑셀 파일/01_조선_데이터참고명세서.xlsx"
{ printf '%s' "${AX_SAMPLE_XLSX_1:?Missing demo sample}"; printf '%s' "${AX_SAMPLE_XLSX_2:-}"; } | base64 -d > "$demo_root/엑셀 파일/02_조선_샘플데이터.xlsx"
export AX_STATE_PATH="$demo_root/state/app-state.json"
export AX_KEY_DIR="$demo_root/state/keys"
exec dotnet /app/app/backend/AxBackend.dll --contentRoot "$demo_root/app/backend"
