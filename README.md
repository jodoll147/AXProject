# 조선 AX 블록 운영 모니터링

조선 블록의 작업지시, 생산 실적, 설비 상태, 사건 이력을 한 화면에서 확인하는 웹 샘플입니다. 현재 데이터는 제공된 합성 엑셀 파일을 사용합니다.

## 프로젝트 구조

```text
app/
  frontend/       Vite 화면 (최종 디자인 템플릿 기반)
  backend/        ASP.NET Core API, 엑셀 데이터 로더
엑셀 파일/         로컬에서 별도로 준비하는 샘플 데이터와 항목 명세 (Git 제외)
work/            기존 HTML 화면과 생성 스크립트
outputs/         생성된 HTML과 화면 샘플
```

프론트엔드와 백엔드는 **한 저장소 안의 별도 폴더**로 관리합니다.

## 실행 방법

필요 환경: .NET SDK 10, Node.js, pnpm.

프로젝트 루트에서 두 터미널을 열어 실행합니다.

```powershell
$env:AX_ADMIN_LOGIN = Read-Host '최초 관리자 아이디'
$env:AX_ADMIN_PASSWORD = Read-Host '최초 관리자 비밀번호 (12자 이상)' -MaskInput
dotnet restore app/backend/AxBackend.csproj
dotnet run --project app/backend/AxBackend.csproj --urls http://127.0.0.1:5182
```

```powershell
cd app/frontend
pnpm install
pnpm dev --host 127.0.0.1
```

브라우저에서 `http://127.0.0.1:5173/`을 엽니다. Vite가 `/api` 요청을 C# 서버로 전달합니다.

## 배포 시 확인

GitHub `main`에 push한 것과 운영 사이트에 배포한 것은 별개입니다. 운영 화면은 `work/screen_template.html`과 `work/sync_frontend.mjs`로 생성하고 `pnpm build`로 빌드합니다. `app/frontend/src/App.jsx`는 현재 진입 화면이 아닙니다.

운영 환경에서도 `/api` 요청이 ASP.NET Core 백엔드로 전달되어야 합니다. Vite의 `server.proxy`는 개발 서버에만 적용됩니다. 정적 빌드만 호스팅하면 로그인·로그아웃·권한·CSV 저장 API가 함께 배포되지 않습니다. 배포 후 `/api/auth/me`가 HTML 대신 세션 JSON을 반환하는지, 관리자 로그인 후 설정·로그아웃과 CSV 서버 검증·저장이 동작하는지 확인해야 합니다. 실제 계정과 데이터 파일은 소스 저장소나 정적 배포 파일에 넣지 않습니다.

## 데이터와 API

`엑셀 파일/01_조선_데이터참고명세서.xlsx`와 `엑셀 파일/02_조선_샘플데이터.xlsx`는 Git에 포함되지 않습니다. 로컬 실행 전에 해당 파일을 별도로 준비해야 합니다. 목업 엑셀, 변환 CSV, ZIP도 Git에 포함하지 않습니다.

C# 서버는 기존 `app/backend/local-data.json`이 있으면 이를 먼저 읽고 없으면 샘플 엑셀의 15개 시트를 읽습니다. 이후 업무 데이터 변경과 감사이력은 `app/backend/app-state.json`에 함께 저장하며 기존 데이터 파일과 샘플 엑셀을 보존합니다. 최초 관리자 설정, 권한과 로컬 실행 제한은 [로그인·권한·감사](docs/로그인_권한_감사.md)를 참고하세요.

| 경로 | 용도 |
| --- | --- |
| `GET /api/health` | 데이터 원본, 최신 스냅샷 시각, 시트별 건수 확인 |
| `GET /api/data` | 15개 시트의 원본 행을 JSON으로 제공 |
| `GET /api/data/status` | 샘플/로컬 모드, 테이블별 건수와 화면 준비 여부 |
| `POST /api/data/reset` | 현재 표시 데이터 초기화 |
| `POST /api/data/upload` | 검증된 CSV 행을 로컬 저장소에 추가 |
| `POST /api/data/restore-sample` | 샘플 엑셀 데이터로 복원 |

화면은 최신 `equipment_snapshot.as_of` 시각까지의 이력으로 현황을 계산합니다. 샘플 데이터 기준 금일 계획 중 완료 2/6건, 기한 도래 미완료 4건, 미해소 사건 3건, 고장설비 1/8대입니다.

## 화면 범위

- 운영현황: 네 가지 핵심 지표, 좌표 기반 공정 배치도, 주목할 작업
- 조회: 호선별 블록과 6공정 상태, 설비, 사건, 생산 지연 목록 및 기간·검색 필터
- 상세: 블록 작업지시서·공정 배치도·계획 실적 타임라인, 작업 기록·사건·조치, 설비 상태 구간
- 운영요약: 규칙 기반 관측 사실과 확인 요청을 수정·복사 가능
- 데이터 업로드: CSV 선택 시 표로 미리보고 중복 키·필수값·형식·참조를 검증합니다. 정상 셀은 초록색, 오류 셀은 빨간색으로 표시하며 표에서 수정할 수 있습니다. 오류가 0건일 때 별도 업로드 버튼을 눌러 로컬 서버에 저장합니다. `.xlsx`는 직접 받지 않으므로 시트별 UTF-8 CSV로 저장해 올립니다. 데이터가 없으면 운영현황은 0/0과 미작업으로 표시
- 로그인과 Settings: 계정별 세 역할, 관리자 권한 설정·사용자 배정·감사이력 조회, 배정된 작업의 실적·사건 입력

외부 AI API, 모델, API 키는 연결하지 않았습니다. 운영요약은 규칙 기반 초안입니다.

현재 실행 화면은 `work/screen_template.html`의 최종 디자인을 `work/sync_frontend.mjs`로 `app/frontend/index.html`에 동기화한 것입니다. `pnpm dev`와 `pnpm build` 전에 자동으로 동기화하며, 데이터와 업로드 항목 명세는 C# API에서 읽습니다. 이전 React 컴포넌트는 `app/frontend/src/`에 보존되어 있지만 현재 진입 화면에서는 사용하지 않습니다. 운영 DB나 MES/PLC에는 연결되지 않았습니다.

기존 HTML 화면은 `python work/build_screen.py`로 다시 생성할 수 있으며 결과는 `outputs/조선_AX_이력탐색_화면.html`입니다.
