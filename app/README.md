# 조선 AX 디자인 화면·C# 웹 실행

## 구조

- `app/frontend`: Vite 8. `work/screen_template.html`의 최종 디자인을 실행 화면으로 사용한다. 기존 React 컴포넌트는 `src/`에 보존되어 있다.
- `app/backend`: ASP.NET Core 10 API + ClosedXML. 샘플 엑셀 또는 로컬 적재 JSON을 읽어 제공한다.
- `엑셀 파일/02_조선_샘플데이터.xlsx`: 로컬에서 별도로 준비하는 초기 샘플 데이터 원본이다. Git에는 포함되지 않으며 초기화와 CSV 업로드는 이 파일을 변경하지 않는다.
- `work/screen_template.html`: 화면 디자인 원본. `work/sync_frontend.mjs`가 개발 실행·빌드 전에 `app/frontend/index.html`로 동기화한다.

## 개발 실행

실행 전에 `엑셀 파일/01_조선_데이터참고명세서.xlsx`와 `엑셀 파일/02_조선_샘플데이터.xlsx`를 로컬에 준비한다. 엑셀·CSV·ZIP 데이터 파일은 Git 추적 대상이 아니다.

서로 다른 터미널에서 프로젝트 루트 기준으로 실행한다.

```powershell
dotnet run --project app/backend/AxBackend.csproj --urls http://127.0.0.1:5182
```

```powershell
cd app/frontend
pnpm install
pnpm dev --host 127.0.0.1
```

화면: `http://127.0.0.1:5173/`. Vite는 `/api` 요청을 C# 서버로 전달한다.

## API

- `GET /api/health`: 원본 파일, 최신 스냅샷 시각, 각 테이블 행 수.
- `GET /api/data`: 현재 선택된 저장소의 15개 테이블을 JSON으로 반환.
- `GET /api/spec`: 업로드 검증에 쓰는 항목 명세를 JSON으로 반환.
- `GET /api/data/status`: 테이블별 행 수와 화면 준비 상태를 반환.
- `POST /api/data/reset`: 현재 표시 데이터를 모두 비움.
- `POST /api/data/upload`: 검증된 CSV 행을 로컬 JSON에 적재.
- `POST /api/data/restore-sample`: 샘플 엑셀로 복원.

## 운영요약

운영요약은 규칙 기반 사실 초안을 표시하고 수정·복사할 수 있다. AI API, 모델, API 키는 연결하지 않았다.

## 현재 범위

현재 화면은 운영현황, 공정 배치도, 주목할 작업, 작업·설비·사건·생산 지연 조회, 블록 작업지시서와 작업·설비 상세, 과거 시각 재생, 규칙 기반 운영요약, CSV 적재를 제공한다. 데이터가 비어 있으면 0/0과 미작업을 표시한다. 운영 DB는 연결하지 않았다.
