# 시스템 구조와 API

## 1. 구성

```text
브라우저
  └─ Vite 개발 서버 :5173
       └─ /api 프록시 → ASP.NET Core :5182
                            ├─ ClosedXML → 샘플 엑셀 파일
                            └─ 계정·감사·변경 데이터를 보관하는 로컬 상태 파일
```

### 프론트엔드

- 현재 진입점: `app/frontend/index.html`. `work/screen_template.html`을 `work/sync_frontend.mjs`로 동기화합니다.
- 화면 집계·조회·운영요약·CSV 업로드 로직도 현재 템플릿에 있습니다. `app/frontend/src/`의 React 코드는 이전 구현으로 보존합니다.
- 초기 로드 시 `GET /api/data`, `GET /api/spec`, `GET /api/data/status`를 호출합니다. 업로드 성공 후 화면을 다시 읽습니다.

### 백엔드

- 프로젝트: `app/backend/AxBackend.csproj`
- API/엑셀 로딩: `app/backend/Program.cs`
- ASP.NET Core Minimal API와 ClosedXML을 사용합니다.
- 백엔드는 샘플 엑셀 또는 로컬 적재 파일을 조회해 테이블을 JSON으로 전달합니다. 운영 도메인 계산 대부분은 프론트엔드가 수행합니다.

## 2. API 엔드포인트

### `GET /api/health`

다음 정보를 JSON으로 반환합니다.

- `status`: 성공 시 `ok`
- `source`: 샘플 엑셀 파일명
- `asOf`: `equipment_snapshot`에서 계산한 최신 스냅샷 시각
- `tables`: 각 시트의 반환 행 수

이 엔드포인트도 전체 통합 문서를 로드하므로 파일/시트 문제가 있으면 실패합니다.

### `GET /api/data`

15개 시트를 `{ 테이블명: [행 객체, ...] }` 구조로 반환합니다. 로그인 후 역할별 권한을 확인합니다. 페이지 필터는 프론트엔드에서 동작하며 페이지네이션과 선택 필드 API는 없습니다.

### 로컬 적재 API

- `GET /api/data/status`: 현재 원본 모드, 테이블별 건수와 화면 준비 여부를 반환합니다.
- `POST /api/data/reset`: 화면 데이터를 빈 로컬 저장소로 초기화합니다. 샘플 엑셀 원본은 유지됩니다.
- `POST /api/data/upload`: `{ table, headers, rows }` JSON을 받아 필드·자료형·필수값·중복 키·참조를 검사한 뒤 한 테이블에 원자적으로 추가합니다.
- `POST /api/data/restore-sample`: 샘플 엑셀을 읽어 상태 파일의 업무 데이터를 교체하고 변경 이력을 기록합니다.

### 계정 및 권한 API

- `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/logout`: 세션 확인, 로그인, 로그아웃.
- `GET/POST /api/admin/permissions`, `GET/POST /api/admin/users`, `POST /api/admin/users/{id}`, `GET /api/admin/audit`: 관리자만 역할 설정, 계정 관리 및 감사 조회.
- `POST /api/work/entry`: 권한을 가진 사용자의 배정된 작업 실적·사건 등록 또는 수정. 관리자는 모든 작업에 접근.
- POST 요청은 `X-Requested-With: AXProject` 헤더를 요구한다. 비인증은 401, 권한 부족은 403이다.

초기화 상태에서도 운영현황·조회·운영요약 화면을 열 수 있습니다. 운영현황 지표는 0/0 또는 0으로, 공정은 미작업으로 표시합니다. 화면에 필요한 기준 테이블과 블록별 공정 작업지시가 준비되면 적재한 데이터를 표시합니다. CSV는 테이블별로 올리며, 참조 대상 테이블을 먼저 적재해야 합니다.

### `GET /api/summary/ai`

현재는 `{ "enabled": false, "text": null }`을 반환하는 비활성 응답입니다. 실제 AI 공급자 호출이나 요약 생성은 없습니다.

## 3. 개발 프록시와 포트

`app/frontend/vite.config.js`에서 개발 서버 호스트/포트는 `127.0.0.1:5173`, `/api` 프록시 목적지는 `http://127.0.0.1:5182`입니다. 백엔드 실행 주소도 같은 값으로 맞춰야 합니다.

프론트엔드가 API 오류를 받으면 화면에 오류 메시지를 표시하고, 연결 확인 안내로 백엔드 주소를 제시합니다.

## 4. 오류와 구성

- 데이터 파일 경로는 `Program.cs`에서 백엔드 콘텐츠 루트를 기준으로 구성됩니다.
- `app/backend/appsettings*.json`에는 기본 로깅 수준과 허용 호스트 설정이 있습니다.
- 환경 변수/비밀키 기반 외부 서비스 연동 설정은 현재 프로젝트에 없습니다.
- 인증·역할별 인가는 서버에서 처리합니다. CORS는 별도로 허용하지 않으며 개발 프록시를 통한 로컬 실행을 전제로 합니다. 계정 초기 설정과 로컬 보안 제약은 [로그인·권한·감사](로그인_권한_감사.md)를 참고하세요.

## 기간 비교 화면 구성 (2026-10-27)

`work/period_comparison.js`, `work/plan_actual_view.js`, `work/plan_actual_view.css`를 동기화 시 템플릿에 삽입합니다. 기존 인증 데이터 API를 사용하며 새 서버 API는 추가하지 않습니다. 디자인 시안도 같은 비교 모듈을 사용합니다.

## 좌표 편집·과거 재생 (2026-10-27)

`POST /api/admin/layout`는 관리자 인가, 좌표·구역 검증과 이전 좌표 충돌 확인 후 데이터/감사를 함께 저장합니다. 과거 재생은 기존 조회 데이터를 이용하며 추가 조회 API는 없습니다. [현재 구현 명세](2D배치_좌표편집_과거재생_구현.md)를 참고하세요.
