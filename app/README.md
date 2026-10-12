# 조선 AX React·C# 웹 실행

## 구조

- `app/frontend`: React 19 + Vite 8 + Lucide 아이콘. 화면과 원본 데이터 조회를 담당한다.
- `app/backend`: ASP.NET Core 10 API + ClosedXML. 엑셀 원본을 읽고 JSON으로 제공한다.
- `엑셀 파일/02_조선_샘플데이터.xlsx`: 현재 화면의 데이터 원본이다. 파일 수정 시 API는 변경 시각을 확인해 다시 읽는다.
- `work/screen_template.html` 및 `outputs/조선_AX_이력탐색_화면.html`: 기존 화면이다. 규칙 기반 운영요약을 유지한다.

## 개발 실행

서로 다른 터미널에서 프로젝트 루트 기준으로 실행한다.

```powershell
dotnet run --project app/backend/AxBackend.csproj --urls http://127.0.0.1:5181
```

```powershell
cd app/frontend
pnpm install
pnpm dev --host 127.0.0.1
```

React 화면: `http://127.0.0.1:5173/`. Vite는 `/api` 요청을 C# 서버로 전달한다.

## API

- `GET /api/health`: 원본 파일, 최신 스냅샷 시각, 각 테이블 행 수.
- `GET /api/data`: 원본 엑셀의 15개 시트를 JSON으로 반환.

## 운영요약

React 운영요약의 규칙 기반 사실 초안은 표시하고 수정·복사할 수 있다. AI 요약 영역은 사용자 요청에 따라 비어 있다. AI API, 모델, API 키는 연결하지 않았다.

## 현재 범위

React 화면은 운영현황, 공정 배치도, 주목할 작업, 작업·설비·미해소 사건 조회, 작업·설비 상세, 규칙 기반 운영요약을 제공한다. 기존 화면의 CSV 업로드 데모, 과거 시각 재생, 블록 상세의 전체 항목은 아직 React로 이식하지 않았다. 데이터 저장소는 엑셀 파일이며 운영 DB는 아니다.
